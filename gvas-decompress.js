// fflate est chargé depuis un CDN au format module ES natif — aucune étape
// de build n'est nécessaire, le navigateur télécharge et exécute ce module
// directement (comme le <script src="...cdn.tailwindcss.com">).
import { unzlibSync } from "https://esm.sh/fflate@0.8.2";

/**
 * Le fichier .sav de Palworld n'est PAS un fichier GVAS brut : il est
 * enveloppé dans un petit conteneur maison avant le zlib :
 *
 *   offset 0-3   : uncompressedLength (uint32 LE)
 *   offset 4-7   : compressedLength   (uint32 LE)
 *   offset 8-10  : magic "PlZ"
 *   offset 11    : saveType (uint8) :
 *                    0x30 = pas de compression (payload = GVAS brut)
 *                    0x31 = zlib simple
 *                    0x32 = zlib double (le payload une fois décompressé
 *                           est LUI-MÊME un blob zlib à décompresser encore)
 *   offset 12+   : payload
 *
 * Cette structure est documentée de façon cohérente par plusieurs outils
 * communautaires indépendants (palworld-save-tools, éditeurs de sauvegarde
 * tiers) et est stable depuis les premières versions du jeu.
 */
export function decompressSav(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength < 12) {
    throw new Error("Fichier trop court pour être un .sav Palworld valide.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const uncompressedLength = view.getUint32(0, true);
  const magic = new TextDecoder("ascii").decode(bytes.subarray(8, 11));
  const saveType = bytes[11];

  if (magic !== "PlZ") {
    throw new Error(
      `Magic bytes inattendus ("${magic}" au lieu de "PlZ") : ce fichier ne ressemble pas ` +
        `à un .sav Palworld standard (ou le format a changé avec une mise à jour du jeu).`
    );
  }

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
    throw new Error(`Type de compression inconnu (0x${saveType.toString(16)}).`);
  }

  if (uncompressedLength && gvasBytes.byteLength !== uncompressedLength) {
    console.warn(
      `[Palworld] Taille décompressée (${gvasBytes.byteLength}) différente de celle ` +
        `annoncée dans l'en-tête (${uncompressedLength}). On continue quand même.`
    );
  }

  return gvasBytes;
}
