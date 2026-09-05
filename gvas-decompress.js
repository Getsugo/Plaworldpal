// fflate, chargé depuis un CDN au format module ES natif (aucune étape de
// build nécessaire). `unzlibSync` décompresse un flux zlib standard
// (équivalent de pako.inflate()) ; `inflateSync` décompresse un flux deflate
// brut sans en-tête zlib (équivalent de pako.inflate({ raw: true })).
import { unzlibSync, inflateSync } from "https://esm.sh/fflate@0.8.2";

/**
 * ⚠️ Changement d'approche : on abandonne toute hypothèse sur la position
 * exacte du magic "PLZ"/"PLM" ou du saveType dans l'en-tête (ces devinettes
 * d'offsets fixes se sont révélées fragiles d'une version du jeu à l'autre).
 *
 * Nouvelle stratégie, indépendante de la structure exacte de l'en-tête :
 *  1. On scanne les 64 premiers octets à la recherche d'un en-tête zlib
 *     valide (CMF=0x78 suivi d'un FLG cohérent — voir isValidZlibHeader).
 *  2. Pour CHAQUE position candidate trouvée, on tente la décompression
 *     zlib à partir de cet offset, en essayant une passe puis deux passes
 *     (certaines sauvegardes Palworld sont doublement compressées).
 *  3. Si aucun en-tête zlib n'est trouvé, on tente un inflate "brut" (sans
 *     en-tête zlib) sur le buffer tronqué après les 12 premiers octets
 *     (hypothèse d'un petit conteneur de taille fixe, en dernier recours
 *     seulement).
 *  4. Si tout échoue, on vérifie si le fichier n'est simplement pas
 *     compressé du tout (signature "GVAS" en clair dans les 256 premiers
 *     octets).
 *
 * Chaque candidat n'est retenu QUE si le résultat décompressé commence
 * effectivement par la signature "GVAS" — c'est cette vérification finale,
 * bien plus que la position de départ, qui garantit qu'on n'accepte jamais
 * un faux positif.
 */

const GVAS_SIGNATURE = [0x47, 0x56, 0x41, 0x53]; // "GVAS"
const ZLIB_SCAN_RANGE = 64;
const RAW_INFLATE_FALLBACK_OFFSET = 12;

export function decompressSav(arrayBuffer, onLog = () => {}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength < 16) {
    throw new Error("Fichier trop court pour être un .sav Palworld valide.");
  }

  const zlibOffsets = findZlibHeaderOffsets(bytes, ZLIB_SCAN_RANGE);
  onLog(
    zlibOffsets.length
      ? `[decompress] En-tête(s) zlib candidat(s) trouvé(s) aux offsets : ${zlibOffsets.join(", ")}.`
      : `[decompress] Aucun en-tête zlib (0x78 ...) trouvé dans les ${ZLIB_SCAN_RANGE} premiers octets.`
  );

  for (const offset of zlibOffsets) {
    const candidate = tryZlibAt(bytes, offset, onLog);
    if (candidate) return candidate;
  }

  onLog(`[decompress] Repli : inflate brut (sans en-tête zlib) à partir de l'offset ${RAW_INFLATE_FALLBACK_OFFSET}...`);
  const rawCandidate = tryRawInflateAt(bytes, RAW_INFLATE_FALLBACK_OFFSET, onLog);
  if (rawCandidate) return rawCandidate;

  onLog("[decompress] Dernier recours : recherche de la signature GVAS en clair (fichier non compressé)...");
  const directOffset = findBytes(bytes, GVAS_SIGNATURE, 0, 256);
  if (directOffset !== -1) {
    onLog(`[decompress] Signature GVAS trouvée en clair à l'offset ${directOffset}.`);
    return bytes.subarray(directOffset);
  }

  throw new Error(
    "Impossible de décompresser ce fichier : aucun flux zlib valide, aucun flux deflate brut, et " +
      "aucune signature GVAS en clair n'ont été trouvés. Voir les logs ci-dessus pour le détail des " +
      "tentatives."
  );
}

/**
 * Cherche toutes les positions plausibles d'un en-tête zlib dans les
 * `scanRange` premiers octets. On ne se contente pas de repérer l'octet
 * 0x78 seul (trop de faux positifs sur du binaire quelconque) : on
 * applique la règle de validation standard du format zlib
 * ((CMF*256 + FLG) % 31 === 0), qui couvre à la fois les combinaisons
 * usuelles (0x78 0x9C, 0x78 0x01, 0x78 0xDA) et les autres FLG valides,
 * tout en éliminant l'immense majorité des octets 0x78 accidentels.
 */
function findZlibHeaderOffsets(bytes, scanRange) {
  const offsets = [];
  const limit = Math.min(scanRange, bytes.length - 2);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] !== 0x78) continue;
    if (isValidZlibHeader(bytes[i], bytes[i + 1])) offsets.push(i);
  }
  return offsets;
}

function isValidZlibHeader(cmf, flg) {
  return (cmf * 256 + flg) % 31 === 0;
}

function tryZlibAt(bytes, offset, onLog) {
  const slice = bytes.subarray(offset);
  try {
    const once = unzlibSync(slice);
    if (startsWithGvas(once)) {
      onLog(`[decompress] Décompression zlib réussie (une passe) à l'offset ${offset}.`);
      return once;
    }
    try {
      const twice = unzlibSync(once);
      if (startsWithGvas(twice)) {
        onLog(`[decompress] Décompression zlib réussie (double passe) à l'offset ${offset}.`);
        return twice;
      }
    } catch {
      /* pas un double zlib valide depuis cet offset */
    }
  } catch (err) {
    onLog(`[decompress]   offset ${offset} : échec zlib (${err.message}).`);
  }
  return null;
}

function tryRawInflateAt(bytes, offset, onLog) {
  if (offset >= bytes.length) return null;
  const slice = bytes.subarray(offset);
  try {
    const once = inflateSync(slice);
    if (startsWithGvas(once)) {
      onLog(`[decompress] Inflate brut réussi (une passe) à l'offset ${offset}.`);
      return once;
    }
    try {
      const twice = inflateSync(once);
      if (startsWithGvas(twice)) {
        onLog(`[decompress] Inflate brut réussi (double passe) à l'offset ${offset}.`);
        return twice;
      }
    } catch {
      /* pas un double inflate brut valide depuis cet offset */
    }
  } catch (err) {
    onLog(`[decompress]   inflate brut @${offset} : échec (${err.message}).`);
  }
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
