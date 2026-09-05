// fflate est chargé depuis un CDN au format module ES natif — aucune étape
// de build n'est nécessaire, le navigateur télécharge et exécute ce module
// directement (comme le <script src="...cdn.tailwindcss.com">).
import { unzlibSync } from "https://esm.sh/fflate@0.8.2";

/**
 * Le fichier .sav de Palworld est enveloppé dans un petit conteneur maison
 * avant le zlib :
 *
 *   offset 0-3   : uncompressedLength (uint32 LE)
 *   offset 4-7   : compressedLength   (uint32 LE)
 *   offset 8-10  : magic "PlZ" (historique) ou "PLM" (mises à jour récentes)
 *   offset 11    : saveType (uint8) :
 *                    0x30 = pas de compression (payload = GVAS brut)
 *                    0x31 = zlib simple
 *                    0x32 = zlib double
 *   offset 12+   : payload
 *
 * ⚠️ CORRECTIF IMPORTANT : quand le magic "PLZ"/"PLM" est reconnu, le
 * payload est TOUJOURS un flux compressé (sauf saveType 0x30) — il ne faut
 * JAMAIS scanner ces octets à la recherche d'une signature "GVAS" en clair,
 * car des octets encore compressés peuvent accidentellement contenir la
 * séquence 0x47 0x56 0x41 0x53 quelque part dans les premiers octets (pur
 * hasard statistique sur du binaire compressé). Traiter ce faux positif
 * comme un point de départ valide revient à faire lire au parser GVAS du
 * binaire zlib comme si c'était du texte de propriétés -> plantage
 * "Lecture hors limites". C'est exactement le bug corrigé ici : le scan en
 * clair n'est plus utilisé QUE si le magic est totalement inconnu (format
 * jamais vu), jamais quand on a reconnu "PLZ"/"PLM".
 */

const GVAS_SIGNATURE = [0x47, 0x56, 0x41, 0x53]; // "GVAS"
const KNOWN_HEADER_MAGICS = ["PLZ", "PLM"];

export function decompressSav(arrayBuffer, onLog = () => {}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength < 12) {
    throw new Error("Fichier trop court pour être un .sav Palworld valide.");
  }

  const magicStr = readMagic(bytes);

  if (KNOWN_HEADER_MAGICS.includes(magicStr)) {
    // Header reconnu : le payload DOIT être décompressé (zlib), jamais lu
    // tel quel en clair (voir avertissement ci-dessus).
    const result = decompressKnownHeader(bytes, magicStr, onLog);
    if (result) return result;
    throw new Error(
      `En-tête "${magicStr}" reconnu, mais le flux zlib qui suit n'a pas pu être décompressé ` +
        `en données GVAS valides (voir les logs ci-dessus pour le détail des tentatives). ` +
        `Le format de compression a peut-être encore changé avec une mise à jour du jeu.`
    );
  }

  // Magic totalement inconnu : ici seulement, on tente des replis génériques
  // (scan direct + scan de flux zlib à des offsets voisins) car on n'a
  // aucune certitude sur la structure du fichier.
  onLog(`[decompress] Magic "${magicStr}" non reconnu (attendu PLZ ou PLM) — tentative de repli générique.`);
  const fallback = fallbackScanForUnknownFormat(bytes, onLog);
  if (fallback) return fallback;

  throw new Error(
    `Magic bytes "${magicStr}" non reconnus et aucun flux GVAS/zlib valide trouvé par le scan de repli.`
  );
}

function readMagic(bytes) {
  const magicBytes = bytes.subarray(8, 11);
  return String.fromCharCode(magicBytes[0], magicBytes[1], magicBytes[2]).toUpperCase();
}

/** Header "PLZ"/"PLM" reconnu : décompression zlib obligatoire, jamais de lecture en clair. */
function decompressKnownHeader(bytes, magicStr, onLog) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const uncompressedLength = view.getUint32(0, true);
  const declaredSaveType = bytes[11];
  const payload = bytes.subarray(12);

  onLog(
    `[decompress] En-tête "${magicStr}" reconnu, type de compression déclaré ` +
      `0x${declaredSaveType.toString(16).padStart(2, "0")}.`
  );

  // 1) On essaie d'abord le type déclaré par le header lui-même.
  let candidate = tryDecompressPayload(payload, declaredSaveType, onLog);
  if (candidate && startsWithGvas(candidate)) {
    logSizeMismatchIfAny(candidate, uncompressedLength, onLog);
    return candidate;
  }

  // 2) Si ça échoue (mauvaise lecture du saveType, format "PLM" légèrement
  // différent...), on retente en FORÇANT chaque hypothèse de compression
  // zlib plutôt que d'abandonner ou de basculer sur une lecture en clair.
  onLog("[decompress] Le type déclaré n'a pas donné de GVAS valide, on force les autres hypothèses zlib...");
  for (const forcedType of [0x31, 0x32]) {
    if (forcedType === declaredSaveType) continue; // déjà essayé
    candidate = tryDecompressPayload(payload, forcedType, onLog);
    if (candidate && startsWithGvas(candidate)) {
      onLog(`[decompress] Succès en forçant le type 0x${forcedType.toString(16)}.`);
      logSizeMismatchIfAny(candidate, uncompressedLength, onLog);
      return candidate;
    }
  }

  // 3) Dernier essai raisonnable : payload non compressé (0x30), mais
  // UNIQUEMENT si le tout premier octet du payload correspond déjà à la
  // signature GVAS (on ne scanne pas plus loin dans du binaire encore
  // compressé — c'est précisément ce qu'il ne faut plus faire).
  if (declaredSaveType !== 0x30 && startsWithGvas(payload)) {
    onLog("[decompress] Le payload n'est en fait pas compressé (0x30), signature GVAS dès le premier octet.");
    return payload;
  }

  return null;
}

function tryDecompressPayload(payload, saveType, onLog) {
  try {
    if (saveType === 0x30) return payload;
    if (saveType === 0x31) return unzlibSync(payload);
    if (saveType === 0x32) {
      const once = unzlibSync(payload);
      return unzlibSync(once);
    }
  } catch (err) {
    onLog(`[decompress] Échec décompression (type 0x${saveType.toString(16)}) : ${err.message}`);
  }
  return null;
}

/**
 * Replis génériques — utilisés UNIQUEMENT quand le magic n'est ni "PLZ" ni
 * "PLM" (format jamais rencontré). Dans ce cas seulement, on accepte de
 * scanner : a) une signature GVAS en clair (fichier potentiellement non
 * compressé avec un en-tête différent), b) un flux zlib à un offset voisin.
 */
function fallbackScanForUnknownFormat(bytes, onLog) {
  const directOffset = findBytes(bytes, GVAS_SIGNATURE, 0, 256);
  if (directOffset !== -1) {
    onLog(`[decompress] Signature GVAS trouvée en clair à l'offset ${directOffset} (fichier non compressé).`);
    return bytes.subarray(directOffset);
  }

  const maxScanOffset = Math.min(64, bytes.length - 2);
  for (let offset = 8; offset <= maxScanOffset; offset++) {
    if (bytes[offset] !== 0x78) continue; // pas un octet CMF zlib plausible
    try {
      const once = unzlibSync(bytes.subarray(offset));
      if (startsWithGvas(once)) {
        onLog(`[decompress] Flux zlib valide trouvé à l'offset ${offset} (une passe).`);
        return once;
      }
      try {
        const twice = unzlibSync(once);
        if (startsWithGvas(twice)) {
          onLog(`[decompress] Flux zlib valide trouvé à l'offset ${offset} (double passe).`);
          return twice;
        }
      } catch {
        /* pas un double zlib valide depuis cet offset */
      }
    } catch {
      /* pas un flux zlib valide depuis cet offset */
    }
  }

  onLog(`[decompress] Aucun flux GVAS trouvé (scan sur les ${maxScanOffset} premiers octets).`);
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
