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
const ZLIB_SCAN_RANGE = 256; // élargi (était 64) au cas où l'en-tête soit plus long que prévu
const RAW_INFLATE_SCAN_RANGE = 64; // le raw deflate n'a pas de magic bytes à détecter, donc on essaie plusieurs offsets plutôt qu'un seul fixe

// Signatures d'autres formats de compression courants, pour donner un
// diagnostic clair si le jeu est passé à l'un d'eux (aucun ne serait
// décompressable par ce code sans une bibliothèque dédiée — fflate ne gère
// que gzip/zlib/deflate).
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

  // Dump hexadécimal des tout premiers octets : indispensable pour
  // diagnostiquer un format d'en-tête qu'on n'a encore jamais rencontré,
  // plutôt que de deviner à l'aveugle à chaque nouveau rapport de bug.
  onLog(`[decompress] Taille du fichier : ${bytes.byteLength} octets.`);
  onLog(`[decompress] Premiers octets (hex) : ${toHex(bytes, 0, 32)}`);

  // Le scan zlib couvre maintenant TOUT le fichier (pas juste un préfixe
  // arbitraire) : sur un fichier de sauvegarde (quelques centaines de Ko à
  // quelques Mo), c'est rapide, et ça élimine complètement la question
  // "l'en-tête fait-il 12, 20, 64 ou 300 octets ?" — on ne suppose plus
  // rien, on cherche partout.
  const zlibOffsets = findZlibHeaderOffsets(bytes, bytes.length);
  onLog(
    zlibOffsets.length
      ? `[decompress] ${zlibOffsets.length} en-tête(s) zlib candidat(s) trouvé(s) (ex: offsets ${zlibOffsets.slice(0, 5).join(", ")}${zlibOffsets.length > 5 ? "..." : ""}).`
      : `[decompress] Aucun en-tête zlib (0x78 ...) trouvé dans tout le fichier.`
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

  // Dernier recours : le fichier n'est peut-être pas compressé du tout. On
  // ne se contente PAS du premier octet "GVAS" trouvé (un faux positif est
  // possible dans du binaire compressé/structuré non reconnu) : on exige
  // en plus que les octets qui suivent ressemblent à un vrai en-tête GVAS
  // (un save_game_version plausible, petit entier) avant d'accepter.
  onLog("[decompress] Dernier recours : recherche d'une signature GVAS en clair plausible (fichier non compressé)...");
  const plausible = findPlausibleGvasInClear(bytes, onLog);
  if (plausible !== -1) {
    onLog(`[decompress] Signature GVAS plausible trouvée en clair à l'offset ${plausible}.`);
    return bytes.subarray(plausible);
  }

  const otherFormat = detectOtherFormat(bytes, Math.min(bytes.length, 4096));
  if (otherFormat) {
    throw new Error(
      `Ce fichier semble compressé en ${otherFormat.name} (signature trouvée à l'offset ${otherFormat.offset}), ` +
        `pas en zlib/deflate — ce format n'est pas géré par ce décodeur (fflate ne supporte que gzip/zlib/deflate). ` +
        `Le jeu a probablement changé de méthode de compression avec une mise à jour récente. Signalez-le avec ` +
        `ce message exact, ça permettra d'ajouter le support du bon format.`
    );
  }

  throw new Error(
    "Impossible de décompresser ce fichier : aucun flux zlib valide, aucun flux deflate brut, et " +
      "aucune signature GVAS en clair plausible n'ont été trouvés. Voir les logs ci-dessus (dump hexadécimal " +
      "et détail des tentatives) — ça permettra de diagnostiquer précisément le format réel de ce fichier."
  );
}

function toHex(bytes, start, count) {
  const end = Math.min(start + count, bytes.length);
  const parts = [];
  for (let i = start; i < end; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
  return parts.join(" ");
}

/**
 * Cherche TOUTES les occurrences de la signature "GVAS" dans le fichier, et
 * ne retient un candidat que si les 4 octets suivants forment un
 * save_game_version plausible (petit entier positif, 1 à 10). C'est un
 * garde-fou bon marché mais efficace : un octet "GVAS" qui apparaît par
 * hasard dans du binaire compressé n'a qu'environ 1 chance sur 4 milliards
 * d'être suivi d'un petit entier plausible par pur hasard.
 */
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
      onLog(`[decompress]   "GVAS" trouvé à l'offset ${offset} mais rejeté (save_game_version=${saveGameVersion} implausible — probablement un faux positif dans du binaire non reconnu).`);
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
