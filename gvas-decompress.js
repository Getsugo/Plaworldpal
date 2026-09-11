// fflate, chargé depuis un CDN au format module ES natif (aucune étape de
// build nécessaire). `unzlibSync` décompresse un flux zlib standard.
import { unzlibSync, inflateSync } from "https://esm.sh/fflate@0.8.2";

/**
 * ⚠️ Réécrit pour suivre EXACTEMENT la logique du code source officiel de
 * palworld-save-tools (palsav.py, github.com/cheahjs/palworld-save-tools),
 * après diagnostic d'un vrai fichier utilisateur qui échouait :
 *
 *  - L'outil officiel ne vérifie JAMAIS que l'octet à l'offset de départ
 *    "ressemble" à un en-tête zlib valide avant de tenter la décompression
 *    — il appelle `zlib.decompress()` directement, sans condition, dès que
 *    le magic ("PlZ"/"PlM") et le type de compression sont reconnus. Mon
 *    ancienne version exigeait un octet 0x78 avant même d'essayer, ce qui
 *    l'empêchait de tenter le bon offset quand ce premier octet ne
 *    ressemblait pas (à tort) à un en-tête zlib standard.
 *  - Il existe un troisième magic, "CNK", qui indique un en-tête imbriqué :
 *    12 octets supplémentaires à sauter, puis un DEUXIÈME en-tête
 *    (magic+type) à relire à ce nouvel endroit. Documenté par le
 *    mainteneur officiel, notamment pour des sauvegardes Xbox/Game Pass.
 *
 * La logique "officielle" est donc essayée EN PREMIER (fidèle à la
 * référence). Le scan générique (recherche d'un flux zlib n'importe où
 * dans le fichier) reste en repli, pour les cas non encore documentés.
 */

const GVAS_SIGNATURE = [0x47, 0x56, 0x41, 0x53]; // "GVAS"
const HEX_DUMP_LENGTH = 128; // agrandi pour permettre un diagnostic plus loin dans le fichier si ça échoue encore
const RAW_INFLATE_SCAN_RANGE = 64;

const OTHER_FORMAT_SIGNATURES = [
  { name: "Zstandard (zstd)", bytes: [0x28, 0xb5, 0x2f, 0xfd] },
  { name: "LZ4 (frame)", bytes: [0x04, 0x22, 0x4d, 0x18] },
  { name: "gzip", bytes: [0x1f, 0x8b] },
];

export function decompressSav(arrayBuffer, onLog = () => {}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength < 16) {
    throw new Error("Fichier trop court pour être un .sav Palworld valide.");
  }

  onLog(`[decompress] Taille du fichier : ${bytes.byteLength} octets.`);
  onLog(`[decompress] Premiers octets (hex) : ${toHex(bytes, 0, HEX_DUMP_LENGTH)}`);

  // --- Étape 1 : logique officielle (magic PlZ/PlM, wrapper CNK) ---------------
  const header = readOfficialHeader(bytes, onLog);
  let officialHeaderClaimsCompressed = false;
  if (header) {
    officialHeaderClaimsCompressed = header.saveType === 0x31 || header.saveType === 0x32;
    const candidate = tryOfficialHeader(bytes, header, onLog);
    if (candidate) return candidate;
    onLog("[decompress] En-tête officiel reconnu mais aucune décompression n'a produit de GVAS valide — repli sur le scan générique.");
  }

  // --- Étape 2 : repli générique (scan zlib sur tout le fichier) ---------------
  const zlibOffsets = findZlibHeaderOffsets(bytes, bytes.length);
  onLog(
    zlibOffsets.length
      ? `[decompress] Repli : ${zlibOffsets.length} en-tête(s) zlib candidat(s) trouvé(s) (ex: offsets ${zlibOffsets.slice(0, 5).join(", ")}${zlibOffsets.length > 5 ? "..." : ""}).`
      : `[decompress] Repli : aucun en-tête zlib (0x78 ...) trouvé dans tout le fichier.`
  );
  for (const offset of zlibOffsets) {
    const candidate = tryZlibAt(bytes, offset, onLog);
    if (candidate) return candidate;
  }

  onLog(`[decompress] Repli : inflate brut (sans en-tête zlib), scan sur les ${RAW_INFLATE_SCAN_RANGE} premiers octets...`);
  for (let offset = 0; offset < Math.min(RAW_INFLATE_SCAN_RANGE, bytes.length); offset++) {
    const candidate = tryRawInflateAt(bytes, offset, onLog);
    if (candidate) return candidate;
  }

  // Le repli "GVAS en clair" ne doit JAMAIS s'appliquer si l'en-tête
  // officiel a déjà affirmé que le fichier est compressé (type 0x31/0x32) —
  // dans ce cas, un "GVAS" trouvé en clair est presque certainement un
  // faux positif dans du binaire encore compressé, même s'il est
  // accidentellement suivi d'un numéro de version plausible (constaté sur
  // un vrai cas : rejeté seulement grâce à cette règle, pas au hasard des
  // octets suivants).
  if (officialHeaderClaimsCompressed) {
    onLog("[decompress] Pas de repli \"GVAS en clair\" : l'en-tête officiel affirme que ce fichier est compressé (type 0x31/0x32), donc un tel match serait forcément un faux positif.");
  } else {
    onLog("[decompress] Dernier recours : recherche d'une signature GVAS en clair plausible (fichier non compressé)...");
    const plausible = findPlausibleGvasInClear(bytes, onLog);
    if (plausible !== -1) {
      onLog(`[decompress] Signature GVAS plausible trouvée en clair à l'offset ${plausible}.`);
      return bytes.subarray(plausible);
    }
  }

  const otherFormat = detectOtherFormat(bytes, Math.min(bytes.length, 4096));
  if (otherFormat) {
    throw new Error(
      `Ce fichier semble compressé en ${otherFormat.name} (signature trouvée à l'offset ${otherFormat.offset}), ` +
        `pas en zlib/deflate — ce format n'est pas géré par ce décodeur (fflate ne supporte que gzip/zlib/deflate). ` +
        `Le jeu a probablement changé de méthode de compression avec une mise à jour récente.`
    );
  }

  throw new Error(
    "Impossible de décompresser ce fichier : ni la logique officielle (magic PlZ/PlM/CNK), ni le scan zlib " +
      "générique, ni l'inflate brut, ni une signature GVAS en clair plausible n'ont fonctionné. Voir le dump " +
      "hexadécimal et les logs ci-dessus."
  );
}

/**
 * Lit l'en-tête exactement comme palsav.py : sizes (0-7), magic (8-10),
 * saveType (11), avec gestion du wrapper "CNK" (en-tête imbriqué 12 octets
 * plus loin) avant de vérifier le magic "PlZ"/"PlM".
 */
function readOfficialHeader(bytes, onLog) {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let compressedLen = view.getUint32(4, true);
  let magicBytes = bytes.subarray(8, 11);
  let saveType = bytes[11];
  let dataStartOffset = 12;
  let magicStr = asciiOf(magicBytes);

  if (magicStr === "CNK") {
    onLog(`[decompress] Wrapper "CNK" détecté à l'offset 8 — lecture de l'en-tête imbriqué à partir de l'offset 12.`);
    if (bytes.length < 24) return null;
    compressedLen = view.getUint32(16, true);
    magicBytes = bytes.subarray(20, 23);
    saveType = bytes[23];
    dataStartOffset = 24;
    magicStr = asciiOf(magicBytes);
  }

  const magicUpper = magicStr.toUpperCase();
  if (magicUpper !== "PLZ" && magicUpper !== "PLM") {
    onLog(`[decompress] Magic "${magicStr}" non reconnu à l'offset ${dataStartOffset - 4} (attendu PlZ/PlM, ou CNK en préfixe).`);
    return null;
  }

  const actualPayloadLen = bytes.length - dataStartOffset;
  onLog(
    `[decompress] En-tête officiel reconnu : magic "${magicStr}", type 0x${saveType.toString(16).padStart(2, "0")}, ` +
      `payload à l'offset ${dataStartOffset} (${actualPayloadLen} octets réels, ${compressedLen} octets déclarés).`
  );
  if (compressedLen !== actualPayloadLen) {
    onLog(`[decompress]   ⚠️ taille déclarée ≠ taille réelle du payload (peut indiquer un fichier tronqué/corrompu, ou un en-tête encore différent) — on tente quand même.`);
  }

  return { saveType, dataStartOffset };
}

function asciiOf(byteArr) {
  return String.fromCharCode(...byteArr);
}

/**
 * Reproduit exactement le comportement de palsav.py : `zlib.decompress()`
 * est tenté SANS aucune vérification préalable que le payload "ressemble"
 * à un flux zlib valide — c'est cette vérification en trop, dans une
 * version précédente de ce fichier, qui empêchait d'essayer le bon offset.
 */
function tryOfficialHeader(bytes, header, onLog) {
  const { saveType, dataStartOffset } = header;
  const payload = bytes.subarray(dataStartOffset);

  if (saveType === 0x30) {
    if (startsWithGvas(payload)) return payload;
    onLog("[decompress] Type 0x30 (non compressé) mais le payload ne commence pas par la signature GVAS.");
    return null;
  }

  if (saveType !== 0x31 && saveType !== 0x32) {
    onLog(`[decompress] Type de compression 0x${saveType.toString(16)} non géré (attendu 0x30/0x31/0x32).`);
    return null;
  }

  const declaredResult = attemptZlibChain(payload, saveType, onLog, "déclaré");
  if (declaredResult) return declaredResult;

  // Repli : au cas où la convention 0x31 (simple) / 0x32 (double) aurait
  // changé, on tente aussi l'autre sens avant d'abandonner cet en-tête.
  const otherType = saveType === 0x31 ? 0x32 : 0x31;
  const otherResult = attemptZlibChain(payload, otherType, onLog, "inverse");
  if (otherResult) return otherResult;

  return null;
}

function attemptZlibChain(payload, saveType, onLog, label) {
  try {
    const once = unzlibSync(payload);
    if (saveType === 0x31) {
      if (startsWithGvas(once)) {
        onLog(`[decompress] Décompression zlib réussie (une passe, type ${label} 0x31).`);
        return once;
      }
      onLog(`[decompress] zlib (type ${label} 0x31) a réussi mais le résultat ne commence pas par "GVAS".`);
      return null;
    }
    // 0x32 : double passe
    try {
      const twice = unzlibSync(once);
      if (startsWithGvas(twice)) {
        onLog(`[decompress] Décompression zlib réussie (double passe, type ${label} 0x32).`);
        return twice;
      }
      onLog(`[decompress] zlib double passe (type ${label} 0x32) a réussi mais le résultat ne commence pas par "GVAS".`);
    } catch (err) {
      onLog(`[decompress] Deuxième passe zlib (type ${label} 0x32) échouée : ${err.message}.`);
    }
  } catch (err) {
    onLog(`[decompress] zlib.decompress() (type ${label}) a échoué : ${err.message}.`);
  }
  return null;
}

function toHex(bytes, start, count) {
  const end = Math.min(start + count, bytes.length);
  const parts = [];
  for (let i = start; i < end; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
  return parts.join(" ");
}

function findPlausibleGvasInClear(bytes, onLog) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let searchFrom = 0;
  while (true) {
    const offset = findBytes(bytes, GVAS_SIGNATURE, searchFrom, bytes.length);
    if (offset === -1) return -1;
    if (offset + 8 <= bytes.length) {
      const saveGameVersion = view.getUint32(offset + 4, true);
      if (saveGameVersion >= 1 && saveGameVersion <= 10) {
        return offset;
      }
      onLog(`[decompress]   "GVAS" trouvé à l'offset ${offset} mais rejeté (save_game_version=${saveGameVersion} implausible).`);
    }
    searchFrom = offset + 1;
  }
}

function detectOtherFormat(bytes, scanRange) {
  const limit = Math.min(scanRange, bytes.length);
  for (const format of OTHER_FORMAT_SIGNATURES) {
    const offset = findBytes(bytes, format.bytes, 0, limit);
    if (offset !== -1) return { name: format.name, offset };
  }
  return null;
}

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
