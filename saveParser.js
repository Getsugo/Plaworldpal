import { decompressSav } from "./gvas-decompress.js";
import { BinaryReader } from "./gvas-binaryReader.js";
import { readHeader, readPropertiesUntilNone } from "./gvas-gvasParser.js";
import { decodeRawDataEntries } from "./gvas-palworldCustomReaders.js";

/**
 * Point d'entrée principal : prend un ArrayBuffer (contenu du fichier
 * Level.sav) et retourne la structure {players, pals} exploitable par le
 * reste de l'app.
 *
 * `onLog` (optionnel) reçoit des messages de progression/debug — branché sur
 * l'onglet Import en mode "debug" pour aider à diagnostiquer un éventuel
 * décalage dans le parsing binaire (voir README).
 */
export function parseSaveFile(arrayBuffer, onLog = () => {}) {
  onLog("Décompression du conteneur .sav...");
  const gvasBytes = decompressSav(arrayBuffer);
  onLog(`Décompressé : ${gvasBytes.byteLength} octets de données GVAS.`);

  const reader = new BinaryReader(gvasBytes);

  onLog("Lecture de l'en-tête GVAS...");
  const header = readHeader(reader);
  onLog(`En-tête OK — classe: ${header.saveGameClassName}, moteur ${header.engine.major}.${header.engine.minor}.${header.engine.patch}`);

  onLog("Lecture du bloc de propriétés racine (peut prendre plusieurs secondes sur une grosse sauvegarde)...");
  const rootProps = readPropertiesUntilNone(reader);

  const worldSaveData = rootProps.worldSaveData && rootProps.worldSaveData.value;
  if (!worldSaveData) {
    throw new Error(
      "Propriété 'worldSaveData' introuvable à la racine. Ce fichier n'est peut-être pas un " +
        "Level.sav (essayez un fichier joueur individuel, ou vérifiez la version du jeu)."
    );
  }

  const charMapProp = worldSaveData.CharacterSaveParameterMap;
  if (!charMapProp || !charMapProp.value || !charMapProp.value.entries) {
    throw new Error("'CharacterSaveParameterMap' introuvable ou vide : aucun Pal/joueur à extraire.");
  }

  onLog(`${charMapProp.value.entries.length} entrée(s) trouvée(s) dans CharacterSaveParameterMap.`);
  const decoded = decodeRawDataEntries(charMapProp.value.entries);

  const players = [];
  const pals = [];

  for (const entry of decoded) {
    const sp = entry.saveParameter;
    if (!sp) continue;

    // La clé de la map contient PlayerUId (toujours présent) et parfois un
    // InstanceId séparé selon le type d'entité.
    const keyProps = entry.key || {};
    const playerUidProp = keyProps.PlayerUId || keyProps.PlayerUID;
    const instanceIdProp = keyProps.InstanceId;

    const playerUid = playerUidProp && playerUidProp.value ? extractGuidLike(playerUidProp.value) : null;
    const instanceId = instanceIdProp && instanceIdProp.value ? extractGuidLike(instanceIdProp.value) : cryptoRandomId();

    if (sp.isPlayer) {
      players.push({
        player_uid: playerUid,
        nickname: sp.nickname || "Joueur inconnu",
      });
      continue;
    }

    if (!sp.characterId) continue;

    pals.push({
      instance_id: instanceId,
      species_id: sp.characterId,
      gender: sp.gender,
      nickname: sp.nickname,
      is_lucky: sp.isRarePal,
      passives: sp.passives,
      owner_uid: playerUid,
    });
  }

  onLog(`Extraction terminée : ${players.length} joueur(s), ${pals.length} Pal(s).`);
  return { header, players, pals };
}

function extractGuidLike(value) {
  if (typeof value === "string") return value;
  if (value && value.__struct === "Guid") return value.value;
  return String(value);
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}`;
}
