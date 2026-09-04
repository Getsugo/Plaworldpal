import { BinaryReader } from "./gvas-binaryReader.js";
import { readPropertiesUntilNone } from "./gvas-gvasParser.js";

/**
 * ⚠️ ZONE À HAUT RISQUE DE CE PROJET ⚠️
 *
 * `CharacterSaveParameterMap` (la structure qui contient TOUS les Pals et
 * joueurs du monde) n'est pas une MapProperty standard : Palworld sérialise
 * chaque entrée avec une clé custom (PlayerUId + InstanceId, deux GUID) et
 * une valeur "RawData" qui est un simple tableau d'octets (ByteProperty[])
 * contenant LUI-MÊME un bloc de propriétés GVAS imbriqué (généralement une
 * unique propriété "SaveParameter" de type StructProperty, qui contient à
 * son tour CharacterID, Gender, NickName, IsPlayer, etc.)
 *
 * C'est exactement cette structure que `palworld-save-tools` (Python)
 * reconstruit avec ses "custom properties" dédiées. La logique ci-dessous
 * reproduit cette structure du mieux possible, mais n'a PAS pu être testée
 * contre un vrai fichier ici (pas d'accès réseau dans cet environnement).
 *
 * Si le parsing échoue ou renvoie des données incohérentes, activez le mode
 * debug dans l'UI (onglet Import → "Afficher les logs de parsing") : chaque
 * étape logue sa position dans le buffer, ce qui permet de repérer
 * précisément où l'hypothèse de structure ci-dessous diverge du fichier réel
 * — et de corriger ce seul fichier sans toucher au reste de l'app.
 */

const CUSTOM_MAP_PROPERTIES = new Set(["CharacterSaveParameterMap", "ItemContainerSaveData", "FoliageGridSaveDataMap"]);

/**
 * Lit une MapProperty custom Palworld (clé = struct GUID, valeur = RawData).
 * `reader` doit être positionné juste après avoir lu keyType/valueType/count
 * d'une MapProperty classique (voir gvasParser.js readPropertyValue).
 *
 * On ne remplace pas la lecture générique de MapProperty : à la place, on
 * ré-interprète après-coup chaque entrée dont la valeur contient un champ
 * "RawData" de type tableau d'octets, en décodant ces octets comme un bloc
 * de propriétés GVAS imbriqué.
 */
export function decodeRawDataEntries(mapEntries) {
  const decoded = [];
  for (const entry of mapEntries) {
    const keyProps = entry.key; // struct générique (PlayerUId, InstanceId...)
    const valueProps = entry.value; // struct générique contenant RawData

    let rawDataBytes = null;
    if (valueProps && valueProps.RawData && valueProps.RawData.value) {
      const rawVal = valueProps.RawData.value;
      // Un ArrayProperty de ByteProperty se retrouve ici sous forme
      // {innerType: "ByteProperty", items: [...]} après lecture générique.
      if (rawVal.items) {
        rawDataBytes = Uint8Array.from(rawVal.items);
      } else if (rawVal.__raw && rawVal.bytes) {
        rawDataBytes = rawVal.bytes;
      }
    }

    let saveParameter = null;
    if (rawDataBytes) {
      try {
        saveParameter = decodeCharacterRawData(rawDataBytes);
      } catch (err) {
        console.warn(`[Palworld] Échec du décodage de RawData pour une entrée: ${err.message}`);
      }
    }

    decoded.push({ key: keyProps, value: valueProps, saveParameter });
  }
  return decoded;
}

/**
 * Décode le blob RawData d'un Pal/joueur. Structure attendue (best-effort) :
 *   - 1 octet : nombre de champs custom qui suivent avant le bloc de
 *     propriétés standard (souvent 0)
 *   - un bloc de propriétés GVAS génériques jusqu'à "None", contenant
 *     typiquement une unique propriété "SaveParameter" de type
 *     StructProperty avec, à l'intérieur : CharacterID, Gender, NickName,
 *     IsPlayer, OwnerPlayerUId, IsRarePal, PassiveSkillList, Talent_HP, etc.
 *
 * Si la lecture directe échoue dès le premier octet, on tente un "scan" :
 * on cherche la première position du buffer où un FString valide "SaveParameter"
 * apparaît, et on reprend le parsing générique à partir de là. Cette
 * stratégie de repli est plus robuste qu'un offset fixe si l'en-tête exact
 * varie selon la version du jeu.
 */
export function decodeCharacterRawData(bytes) {
  // Tentative directe
  try {
    const reader = new BinaryReader(bytes);
    const props = readPropertiesUntilNone(reader);
    if (props.SaveParameter) return unwrapStruct(props.SaveParameter.value);
    if (Object.keys(props).length > 0) return unwrapAnyPropsAsPal(props);
  } catch (err) {
    // on retente via le scan ci-dessous
  }

  const offset = findSaveParameterOffset(bytes);
  if (offset === -1) {
    throw new Error("Impossible de localiser 'SaveParameter' dans ce blob RawData.");
  }
  const reader = new BinaryReader(bytes.subarray(offset - 8 >= 0 ? offset - 8 : 0));
  const props = readPropertiesUntilNone(reader);
  if (props.SaveParameter) return unwrapStruct(props.SaveParameter.value);
  return unwrapAnyPropsAsPal(props);
}

function unwrapStruct(structProps) {
  return unwrapAnyPropsAsPal(structProps);
}

/** Extrait les champs qui nous intéressent d'un objet de propriétés générique. */
function unwrapAnyPropsAsPal(props) {
  const get = (key) => (props[key] ? props[key].value : undefined);

  const characterId = get("CharacterID");
  const isPlayer = get("IsPlayer");
  const genderRaw = get("Gender");
  const nickname = get("NickName");
  const isRarePal = get("IsRarePal");
  const passiveList = get("PassiveSkillList");

  let gender = "Unknown";
  if (genderRaw && typeof genderRaw === "object" && genderRaw.value) {
    if (String(genderRaw.value).includes("Female")) gender = "Female";
    else if (String(genderRaw.value).includes("Male")) gender = "Male";
  }

  let passives = [];
  if (passiveList && passiveList.items) {
    passives = passiveList.items.filter(v => typeof v === "string");
  }

  return {
    characterId: typeof characterId === "string" ? characterId : null,
    isPlayer: !!isPlayer,
    gender,
    nickname: typeof nickname === "string" ? nickname : null,
    isRarePal: !!isRarePal,
    passives,
  };
}

/** Recherche naïve d'une FString "SaveParameter" dans un buffer d'octets. */
function findSaveParameterOffset(bytes) {
  const needle = "SaveParameter";
  const needleBytes = new TextEncoder().encode(needle);
  outer: for (let i = 0; i < bytes.length - needleBytes.length; i++) {
    for (let j = 0; j < needleBytes.length; j++) {
      if (bytes[i + j] !== needleBytes[j]) continue outer;
    }
    return i;
  }
  return -1;
}
