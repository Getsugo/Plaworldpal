import { decompressSav } from "./gvas-decompress.js";
import { BinaryReader } from "./gvas-binaryReader.js";
import { readHeader, readPropertiesUntilNone } from "./gvas-gvasParser.js";
import { decodeRawDataEntries } from "./gvas-palworldCustomReaders.js";

/**
 * Point d'entrée principal : prend un ArrayBuffer (contenu d'un fichier
 * Level.sav OU d'un fichier joueur individuel Players/<PlayerUID>.sav) et
 * retourne la structure {players, pals} exploitable par le reste de l'app.
 *
 * ⚠️ Honnêteté sur Players/*.sav : la structure racine d'un fichier
 * Level.sav (propriété "worldSaveData" contenant "CharacterSaveParameterMap")
 * est bien documentée par la communauté. Celle des fichiers joueur
 * individuels l'est beaucoup moins, et peut varier selon les versions du
 * jeu — je n'ai pas de confirmation fiable du nom exact de la propriété
 * racine qui y contiendrait les Pals. Plutôt que de deviner un chemin fixe
 * (ex: "SaveData.xxx") au risque de me tromper silencieusement, la fonction
 * ci-dessous cherche "CharacterSaveParameterMap" PARTOUT dans l'arbre de
 * propriétés décodé, à n'importe quelle profondeur. Ça fonctionne pour
 * Level.sav (où on sait qu'elle existe) et ça donne aussi une chance
 * réaliste de fonctionner pour un fichier joueur si une structure du même
 * nom y est présente — sans reposer sur une hypothèse de chemin non
 * vérifiée.
 *
 * `onLog` (optionnel) reçoit des messages de progression/debug.
 */
export function parseSaveFile(arrayBuffer, onLog = () => {}) {
  onLog("Décompression du conteneur .sav...");
  const gvasBytes = decompressSav(arrayBuffer, onLog);
  onLog(`Décompressé : ${gvasBytes.byteLength} octets de données GVAS.`);

  const reader = new BinaryReader(gvasBytes);

  onLog("Lecture de l'en-tête GVAS...");
  const header = readHeader(reader);
  onLog(`En-tête OK — classe: ${header.saveGameClassName}, moteur ${header.engine.major}.${header.engine.minor}.${header.engine.patch}`);

  onLog("Lecture du bloc de propriétés racine (peut prendre plusieurs secondes sur une grosse sauvegarde)...");
  const rootProps = readPropertiesUntilNone(reader);

  onLog("Recherche de 'CharacterSaveParameterMap' dans l'arbre de propriétés (Level.sav ou Players/*.sav)...");
  const charMap = findCharacterSaveParameterMap(rootProps);

  if (!charMap || !charMap.entries) {
    throw new Error(
      "'CharacterSaveParameterMap' introuvable dans ce fichier. Si c'est un fichier Players/*.sav, " +
        "il se peut que cette version du jeu stocke les Pals sous un nom de propriété différent — " +
        "activez les logs de parsing et montrez-les pour qu'on puisse ajuster. Level.sav reste le " +
        "fichier le plus fiable pour extraire l'intégralité des Pals."
    );
  }

  onLog(`${charMap.entries.length} entrée(s) trouvée(s) dans CharacterSaveParameterMap.`);
  const decoded = decodeRawDataEntries(charMap.entries);

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

/**
 * Recherche récursive et générique d'une propriété nommée
 * "CharacterSaveParameterMap" (valeur de type MapProperty, avec un champ
 * `.entries`) n'importe où dans l'arbre de propriétés décodé — pas de
 * chemin fixe supposé, pour rester valable aussi bien pour Level.sav que
 * pour un fichier joueur dont la structure exacte n'est pas garantie.
 */
function findCharacterSaveParameterMap(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 14) return null;

  if (
    node.CharacterSaveParameterMap &&
    node.CharacterSaveParameterMap.value &&
    Array.isArray(node.CharacterSaveParameterMap.value.entries)
  ) {
    return node.CharacterSaveParameterMap.value;
  }

  for (const key of Object.keys(node)) {
    const prop = node[key];
    if (!prop || typeof prop !== "object") continue;

    const value = prop.value !== undefined ? prop.value : prop;
    if (!value || typeof value !== "object") continue;

    const direct = findCharacterSaveParameterMap(value, depth + 1);
    if (direct) return direct;

    if (Array.isArray(value.items)) {
      for (const item of value.items) {
        const found = findCharacterSaveParameterMap(item, depth + 1);
        if (found) return found;
      }
    }
    if (Array.isArray(value.entries)) {
      for (const entry of value.entries) {
        const found =
          findCharacterSaveParameterMap(entry.value, depth + 1) ||
          findCharacterSaveParameterMap(entry.key, depth + 1);
        if (found) return found;
      }
    }
  }
  return null;
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
