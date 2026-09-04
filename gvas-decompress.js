// fflate est chargé depuis un CDN au format module ES natif — aucune étape
// de build n'est nécessaire, le navigateur télécharge et exécute ce module
// directement (comme le <script src="...cdn.tailwindcss.com">).
import { unzlibSync } from "https://esm.sh/fflate@0.8.2";

/**
 * Le fichier .sav de Palworld n'est PAS un fichier GVAS brut : il est
 * enveloppé dans un petit conteneur maison avant le zlib. Le schéma
 * "historique" (documenté par palworld-save-tools et repris par la plupart
 * des outils communautaires) est :
 *
 *   offset 0-3   : uncompressedLength (uint32 LE)
 *   offset 4-7   : compressedLength   (uint32 LE)
 *   offset 8-10  : magic "PlZ"
 *   offset 11    : saveType (uint8) :
 *                    0x30 = pas de compression (payload = GVAS brut)
 *                    0x31 = zlib simple
 *                    0x32 = zlib double
 *   offset 12+   : payload
 *
 * ⚠️ Retour de terrain (confirmé sur une vraie sauvegarde) : une mise à jour
 * récente du jeu utilise désormais le magic "PLM" au lieu de "PlZ" sur
 * certaines sauvegardes. On ne sait pas avec certitude si la suite de la
 * structure (offset du payload, types de compression) a changé en même
 * temps — donc plutôt que de deviner un nouvel offset fixe à l'aveugle, la
 * stratégie ci-dessous est en 2 temps :
 *   1. On accepte "PlZ" ET "PLM" (comparaison insensible à la casse) avec
 *      le même schéma d'offsets que l'historique — c'est l'hypothèse la
 *      plus probable (juste un changement d'étiquette).
 *   2. Si ça échoue (magic non reconnu, décompression qui plante, ou
 *      résultat qui ne commence pas par la signature "GVAS"), on bascule
 *      sur un repli qui scanne le buffer à la recherche soit de la
 *      signature "GVAS" en clair (cas non compressé avec un en-tête plus
 *      long que prévu), soit d'un flux zlib valide à un offset voisin.
 */

const GVAS_SIGNATURE = [0x47, 0x56, 0x41, 0x53]; // "GVAS"
const KNOWN_HEADER_MAGICS = ["PLZ", "PLM"];

export function decompressSav(arrayBuffer, onLog = () => {}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength < 12) {
    throw new Error("Fichier trop court pour être un .sav Palworld valide.");
  }

  // --- Étape 1 : en-tête standard 12 octets (PlZ historique ou PLM récent) ---
  try {
    const result = tryStandardHeader(bytes, onLog);
    if (result) return result;
  } catch (err) {
    onLog(`[decompress] En-tête standard : échec (${err.message}).`);
  }

  // --- Étape 2 : repli par scan (nouveau format d'en-tête non reconnu) ---
  onLog("[decompress] Repli : recherche de la signature GVAS dans le fichier...");
  const fallback = fallbackScanForGvas(bytes, onLog);
  if (fallback) return fallback;

  throw new Error(
    "Impossible de localiser ou décompresser les données GVAS dans ce fichier. " +
      "Le format d'en-tête a peut-être encore changé avec une mise à jour récente du jeu " +
      "(voir les logs de parsing ci-dessus pour ce qui a été essayé)."
  );
}

/** Hypothèse principale : header 12 octets, magic "PlZ"/"PLM", offsets connus. */
function tryStandardHeader(bytes, onLog) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const uncompressedLength = view.getUint32(0, true);
  const magicBytes = bytes.subarray(8, 11);
  const magicStr = String.fromCharCode(magicBytes[0], magicBytes[1], magicBytes[2]).toUpperCase();
  const saveType = bytes[11];

  if (!KNOWN_HEADER_MAGICS.includes(magicStr)) {
    onLog(`[decompress] Magic bytes "${magicStr}" non reconnus à l'offset 8 (attendu PLZ ou PLM).`);
    return null;
  }
  onLog(`[decompress] Magic "${magicStr}" reconnu, type de compression 0x${saveType.toString(16).padStart(2, "0")}.`);

  const payload = bytes.subarray(12);
  let gvasBytes;

  if (saveType === 0x30) {
    gvasBytes = payload;
  } else if (saveType === 0x31) {
    gvasBytes = unzlibSync(payload);
  } else if (saveType === 0x32) {
    const once = unzlibSync(payload);
    gvasBytes = unzlibSync(once);
  } else {
    onLog(`[decompress] Type de compression 0x${saveType.toString(16)} inconnu pour ce magic.`);
    return null;
  }

  if (!startsWithGvas(gvasBytes)) {
    onLog(
      `[decompress] Décompression "réussie" mais le résultat ne commence pas par "GVAS" ` +
        `(probablement un décalage d'offset propre au format "${magicStr}").`
    );
    return null;
  }

  logSizeMismatchIfAny(gvasBytes, uncompressedLength, onLog);
  return gvasBytes;
}

/**
 * Repli générique, utilisé quand l'hypothèse d'en-tête standard échoue :
 *  a) le fichier n'est peut-être pas compressé du tout et contient "GVAS"
 *     en clair quelque part dans les tout premiers octets (en-tête plus
 *     long/différent que prévu) ;
 *  b) sinon, on cherche un flux zlib valide en essayant plusieurs offsets
 *     de départ plausibles (un octet CMF de zlib commence quasi toujours
 *     par 0x78) et on vérifie si le résultat décompressé commence par
 *     "GVAS" (une ou deux passes de zlib, comme le double-compress connu).
 */
function fallbackScanForGvas(bytes, onLog) {
  // a) scan direct "GVAS" en clair dans les 256 premiers octets
  const directOffset = findBytes(bytes, GVAS_SIGNATURE, 0, 256);
  if (directOffset !== -1) {
    onLog(`[decompress] Signature GVAS trouvée en clair à l'offset ${directOffset} (fichier non compressé).`);
    return bytes.subarray(directOffset);
  }

  // b) scan des offsets candidats pour un flux zlib (octet CMF = 0x78)
  const maxScanOffset = Math.min(64, bytes.length - 2);
  for (let offset = 8; offset <= maxScanOffset; offset++) {
    if (bytes[offset] !== 0x78) continue; // pas un en-tête zlib plausible

    // Simple passe
    try {
      const once = unzlibSync(bytes.subarray(offset));
      if (startsWithGvas(once)) {
        onLog(`[decompress] Flux zlib valide trouvé à l'offset ${offset} (une passe).`);
        return once;
      }
      // Double passe (cas "compressé deux fois" connu du format historique)
      try {
        const twice = unzlibSync(once);
        if (startsWithGvas(twice)) {
          onLog(`[decompress] Flux zlib valide trouvé à l'offset ${offset} (double passe).`);
          return twice;
        }
      } catch {
        /* pas un double zlib valide depuis cet offset, on continue le scan */
      }
    } catch {
      /* pas un flux zlib valide depuis cet offset, on continue le scan */
    }
  }

  onLog(`[decompress] Aucun flux GVAS trouvé (scan direct ni zlib sur les ${maxScanOffset} premiers octets).`);
  return null;
}

function startsWithGvas(bytes) {
  if (!bytes || bytes.length < 4) return false;
  return GVAS_SIGNATURE.every((b, i) => bytes[i] === b);
}

function findBytes(haystack, needleArr, fromOffset, maxOffset) {
  const limit = Math.min(maxOffset, haystack.length - needleArr.length);
  outer: for (let i = fromOffset; i <= limit; i++) {
    for (let j = 0; j < needleArr.length; j++) {
      if (haystack[i + j] !== needleArr[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function logSizeMismatchIfAny(gvasBytes, uncompressedLength, onLog) {
  if (uncompressedLength && gvasBytes.byteLength !== uncompressedLength) {
    onLog(
      `[decompress] Taille décompressée (${gvasBytes.byteLength}) différente de celle annoncée ` +
        `dans l'en-tête (${uncompressedLength}). On continue quand même.`
    );
  }
}
