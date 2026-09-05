// fflate est chargé depuis un CDN au format module ES natif — aucune étape
// de build n'est nécessaire. `unzlibSync` décompresse un flux zlib standard
// (équivalent de pako.inflate()) ; `inflateSync` décompresse un flux deflate
// brut sans en-tête zlib (équivalent de pako.inflate({ raw: true })).
import { unzlibSync, inflateSync } from "https://esm.sh/fflate@0.8.2";

/**
 * Le fichier .sav de Palworld est enveloppé dans un petit conteneur maison
 * avant le zlib. Deux structures d'en-tête ont été rapportées :
 *
 *  Hypothèse A (confirmée empiriquement par un précédent rapport de bug —
 *  c'est cette lecture qui a correctement identifié le magic "PLM") :
 *   offset 0-3   : uncompressedLength (uint32 LE)
 *   offset 4-7   : compressedLength   (uint32 LE)
 *   offset 8-10  : magic "PlZ" / "PLM"
 *   offset 11    : saveType (uint8)
 *
 *  Hypothèse B (signalée plus récemment) :
 *   offset 0-2   : magic "PLZ" / "PLM"
 *   offset 3     : saveType (uint8)
 *   offset 4-7   : uncompressedLength (uint32 LE)
 *   offset 8-11  : compressedLength   (uint32 LE)
 *
 * Dans les deux cas l'en-tête fait 12 octets et le payload commence à
 * l'offset 12 — donc la seule vraie différence fonctionnelle est OÙ lire le
 * magic et le saveType. On essaie les deux hypothèses, dans l'ordre, et on
 * ne retient que celle qui produit effectivement des données commençant par
 * la signature "GVAS" après décompression.
 *
 * Pour le saveType, deux conventions ont aussi été rapportées (0x31=simple/
 * 0x32=double, ou l'inverse) : on essaie les deux sens à chaque fois, plus
 * un repli en "inflate brut" (sans en-tête zlib) si le mode zlib standard
 * échoue.
 *
 * ⚠️ Quel que soit le magic reconnu ("PLZ"/"PLM"), on ne bascule JAMAIS sur
 * une lecture "en clair" du payload sans décompression : des octets encore
 * compressés peuvent accidentellement contenir la séquence "GVAS" par pur
 * hasard statistique, et les lire comme du texte fait planter le parser
 * ("Lecture hors limites"). Le scan en clair reste réservé au cas où AUCUNE
 * des deux hypothèses de magic ne correspond à un format connu.
 */

const GVAS_SIGNATURE = [0x47, 0x56, 0x41, 0x53]; // "GVAS"
const KNOWN_HEADER_MAGICS = ["PLZ", "PLM"];

export function decompressSav(arrayBuffer, onLog = () => {}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength < 12) {
    throw new Error("Fichier trop court pour être un .sav Palworld valide.");
  }

  const magicA = readMagicStr(bytes.subarray(8, 11));
  const magicB = readMagicStr(bytes.subarray(0, 3));
  const magicRecognizedSomewhere =
    KNOWN_HEADER_MAGICS.includes(magicA) || KNOWN_HEADER_MAGICS.includes(magicB);

  const hypA = tryHeaderHypothesis(bytes, "A (magic@8, type@11)", magicA, bytes[11], onLog);
  if (hypA) return hypA;

  const hypB = tryHeaderHypothesis(bytes, "B (magic@0, type@3)", magicB, bytes[3], onLog);
  if (hypB) return hypB;

  if (magicRecognizedSomewhere) {
    // Un magic "PLZ"/"PLM" A été reconnu (dans au moins une des deux
    // hypothèses), mais aucun mode de décompression n'a produit de GVAS
    // valide. On lève une erreur claire ici — on ne bascule SURTOUT PAS sur
    // le scan générique ci-dessous, qui accepterait sinon n'importe quelle
    // séquence "GVAS" trouvée par hasard dans les octets encore compressés
    // (c'est exactement le bug qu'on corrige : un magic reconnu implique
    // que le payload est forcément compressé, jamais lu en clair).
    throw new Error(
      "Magic \"PLZ\"/\"PLM\" reconnu, mais aucune combinaison de décompression (zlib simple/double, " +
        "brut simple/double, sur les deux hypothèses d'en-tête) n'a produit de données GVAS valides. " +
        "Voir les logs ci-dessus pour le détail des tentatives — le format de compression a peut-être " +
        "encore changé avec une mise à jour du jeu."
    );
  }

  onLog("[decompress] Aucun magic \"PLZ\"/\"PLM\" reconnu dans les deux hypothèses — repli générique.");
  const fallback = fallbackScanForUnknownFormat(bytes, onLog);
  if (fallback) return fallback;

  throw new Error(
    "Impossible de décoder ce fichier .sav : ni l'hypothèse d'en-tête historique, ni l'alternative " +
      "récente, ni le repli générique n'ont produit de données GVAS valides. Le format a peut-être " +
      "encore changé (voir les logs ci-dessus pour le détail des tentatives)."
  );
}

function readMagicStr(magicBytes) {
  return String.fromCharCode(magicBytes[0], magicBytes[1], magicBytes[2]).toUpperCase();
}

function tryHeaderHypothesis(bytes, label, magicStr, saveType, onLog) {
  if (!KNOWN_HEADER_MAGICS.includes(magicStr)) return null;

  onLog(`[decompress] Hypothèse ${label} : magic "${magicStr}" reconnu, type déclaré 0x${saveType.toString(16).padStart(2, "0")}.`);
  const payload = bytes.subarray(12);
  const candidate = attemptDecompress(payload, saveType, onLog);

  if (candidate && startsWithGvas(candidate)) {
    onLog(`[decompress] Hypothèse ${label} : succès.`);
    return candidate;
  }
  onLog(`[decompress] Hypothèse ${label} : magic reconnu mais aucun mode de décompression n'a produit de GVAS valide.`);
  return null;
}

/**
 * Essaie tous les modes de décompression plausibles pour un payload donné,
 * dans un ordre qui privilégie d'abord la convention explicitement signalée
 * (0x31 = double zlib, 0x32 = simple zlib), avant de retomber sur la
 * convention inverse puis sur un inflate brut (sans en-tête zlib).
 */
function attemptDecompress(payload, saveType, onLog) {
  if (saveType === 0x30) {
    // Non compressé — mais on exige que la signature GVAS soit DÉJÀ là dès
    // le premier octet (pas de scan plus loin dans le payload).
    return startsWithGvas(payload) ? payload : null;
  }

  const modeOrder =
    saveType === 0x31
      ? ["double", "single"]
      : saveType === 0x32
      ? ["single", "double"]
      : ["double", "single"]; // saveType inconnu : on essaie quand même les deux

  for (const mode of modeOrder) {
    const candidate = decompressWithMode(payload, mode, onLog);
    if (candidate && startsWithGvas(candidate)) return candidate;
  }

  // Dernier recours : inflate "brut" (sans en-tête zlib), équivalent de
  // pako.inflate({ raw: true }), en simple puis double passe.
  for (const mode of ["rawSingle", "rawDouble"]) {
    const candidate = decompressWithMode(payload, mode, onLog);
    if (candidate && startsWithGvas(candidate)) return candidate;
  }

  return null;
}

function decompressWithMode(payload, mode, onLog) {
  try {
    if (mode === "single") return unzlibSync(payload);
    if (mode === "double") {
      const once = unzlibSync(payload);
      return unzlibSync(once);
    }
    if (mode === "rawSingle") return inflateSync(payload);
    if (mode === "rawDouble") {
      const once = inflateSync(payload);
      return inflateSync(once);
    }
  } catch (err) {
    onLog(`[decompress]   mode "${mode}" : échec (${err.message}).`);
  }
  return null;
}

/**
 * Repli générique — utilisé UNIQUEMENT quand ni l'hypothèse A ni B ne
 * reconnaît de magic connu. Dans ce cas seulement, on accepte de scanner :
 * a) une signature GVAS en clair (fichier non compressé, en-tête différent),
 * b) un flux zlib à un offset voisin.
 */
function fallbackScanForUnknownFormat(bytes, onLog) {
  const directOffset = findBytes(bytes, GVAS_SIGNATURE, 0, 256);
  if (directOffset !== -1) {
    onLog(`[decompress] Signature GVAS trouvée en clair à l'offset ${directOffset} (fichier non compressé).`);
    return bytes.subarray(directOffset);
  }

  const maxScanOffset = Math.min(64, bytes.length - 2);
  for (let offset = 0; offset <= maxScanOffset; offset++) {
    if (bytes[offset] !== 0x78) continue; // pas un octet CMF zlib plausible
    const single = decompressWithMode(bytes.subarray(offset), "single", onLog);
    if (single && startsWithGvas(single)) {
      onLog(`[decompress] Flux zlib valide trouvé à l'offset ${offset} (une passe).`);
      return single;
    }
    const double = decompressWithMode(bytes.subarray(offset), "double", onLog);
    if (double && startsWithGvas(double)) {
      onLog(`[decompress] Flux zlib valide trouvé à l'offset ${offset} (double passe).`);
      return double;
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
