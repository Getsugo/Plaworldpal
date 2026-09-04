import { BinaryReader } from "./gvas-binaryReader.js";

/**
 * Décodeur du système de propriétés "GVAS" utilisé par les jeux Unreal
 * Engine pour leurs SaveGame (format FPropertyTag). C'est un format
 * générique, indépendant de Palworld : nom de propriété, type, taille en
 * octets, puis la valeur elle-même. La lecture s'arrête sur une propriété
 * nommée "None" (marqueur de fin de bloc).
 *
 * ⚠️ Ce format binaire n'est pas documenté officiellement par Epic Games ni
 * par Pocketpair (l'éditeur de Palworld). L'implémentation ci-dessous suit
 * la structure généralement observée et portée par plusieurs outils
 * communautaires indépendants (palworld-save-tools en Python, GVAS-JSON-
 * Converter, UnrealEngine.Gvas en C#...), mais n'a PAS pu être validée ici
 * contre un vrai fichier de sauvegarde (environnement sans accès réseau).
 * Voir README.md § "Débogage du parsing" si des propriétés ne remontent pas
 * correctement — le lecteur logue la position et le contexte à chaque échec
 * pour faciliter le diagnostic plutôt que d'échouer silencieusement.
 */

export function readHeader(reader) {
  const magic = new TextDecoder("ascii").decode(reader.bytesRaw(4));
  if (magic !== "GVAS") {
    throw new Error(`En-tête GVAS invalide (magic="${magic}"). Décompression probablement incorrecte.`);
  }

  const saveGameVersion = reader.i32();
  const packageVersionUE4 = reader.i32();
  // La version UE5 n'existe que sur les formats récents (>= 3). On la lit de
  // façon défensive : si elle n'existe pas, ce sera simplement 0.
  let packageVersionUE5 = 0;
  if (saveGameVersion >= 3) {
    packageVersionUE5 = reader.i32();
  }

  const engineVersionMajor = reader.u16();
  const engineVersionMinor = reader.u16();
  const engineVersionPatch = reader.u16();
  const engineVersionChangelist = reader.u32();
  const engineVersionBranch = reader.fstring();

  const customVersionFormat = reader.i32();
  const customVersionCount = reader.i32();
  const customVersions = [];
  for (let i = 0; i < customVersionCount; i++) {
    const guid = reader.guid();
    const version = reader.i32();
    customVersions.push({ guid, version });
  }

  const saveGameClassName = reader.fstring();

  return {
    saveGameVersion,
    packageVersionUE4,
    packageVersionUE5,
    engine: {
      major: engineVersionMajor,
      minor: engineVersionMinor,
      patch: engineVersionPatch,
      changelist: engineVersionChangelist,
      branch: engineVersionBranch,
    },
    customVersionFormat,
    customVersions,
    saveGameClassName,
  };
}

const SIMPLE_TYPE_READERS = {
  IntProperty: r => r.i32(),
  UInt32Property: r => r.u32(),
  Int64Property: r => Number(r.i64()),
  UInt64Property: r => Number(r.u64()),
  Int16Property: r => r.i16(),
  UInt16Property: r => r.u16(),
  Int8Property: r => r.i8(),
  ByteProperty: null, // géré à part (peut être un enum)
  FloatProperty: r => r.f32(),
  DoubleProperty: r => r.f64(),
  BoolProperty: null, // valeur inline dans le tag, gérée à part
  StrProperty: r => r.fstring(),
  NameProperty: r => r.fstring(),
  TextProperty: null, // structure spéciale, gérée à part
};

/**
 * Lit UNE propriété (nom + type + taille + valeur). Retourne `null` quand on
 * rencontre le marqueur de fin "None".
 */
export function readProperty(reader) {
  const name = reader.fstring();
  if (name === "None" || name === "") return null;

  const type = reader.fstring();
  const size = Number(reader.i64());
  const arrayIndex = reader.i32();

  const valueStartPos = reader.tell();
  let value;

  try {
    value = readPropertyValue(reader, type, size, name);
  } catch (err) {
    // Résilience : si la valeur n'a pas pu être décodée finement (type
    // exotique / imbrication non gérée), on se rabat sur les octets bruts
    // pour ne pas casser tout le reste du fichier, et on avance exactement
    // de `size` octets depuis le début de la valeur.
    console.warn(`[GVAS] Échec du décodage fin de "${name}" (${type}) @${valueStartPos}: ${err.message}`);
    reader.seek(valueStartPos);
    value = { __raw: true, bytes: reader.bytesRaw(size) };
  }

  // Toujours se resynchroniser sur la taille déclarée, même si le décodeur
  // fin a lu un nombre d'octets différent (garde-fou anti-désynchronisation).
  const consumed = reader.tell() - valueStartPos;
  if (consumed !== size) {
    reader.seek(valueStartPos + size);
  }

  return { name, type, size, arrayIndex, value };
}

function readPropertyValue(reader, type, size, name) {
  if (type === "BoolProperty") {
    // BoolProperty stocke sa valeur DANS le tag lui-même (1 octet), pas
    // après. `size` vaut 0 dans ce cas.
    return reader.bool();
  }

  if (type === "ByteProperty") {
    // Peut être soit un octet brut, soit un "enum" représenté par un FName.
    // On lit d'abord le nom d'enum (FString) qui précède toujours la valeur.
    const enumName = reader.fstring();
    if (enumName === "None") {
      const v = reader.u8();
      return { enumType: null, value: v };
    }
    const enumValue = reader.fstring();
    return { enumType: enumName, value: enumValue };
  }

  if (type === "EnumProperty") {
    const enumType = reader.fstring();
    const enumValue = reader.fstring();
    return { enumType, value: enumValue };
  }

  if (type === "StrProperty" || type === "NameProperty") {
    return reader.fstring();
  }

  if (SIMPLE_TYPE_READERS[type]) {
    return SIMPLE_TYPE_READERS[type](reader);
  }

  if (type === "StructProperty") {
    const structName = reader.fstring();
    const structGuid = reader.guid();
    return readStructValue(reader, structName, size);
  }

  if (type === "ArrayProperty") {
    const innerType = reader.fstring();
    const count = reader.i32();
    const items = [];

    if (innerType === "StructProperty") {
      // Cas particulier fréquent (ex: CharacterSaveParameterMap) : un
      // ArrayProperty de StructProperty commence par UN SEUL tag de
      // propriété décrivant le type de struct commun à tous les éléments.
      const arrayStructName = reader.fstring(); // nom de propriété (souvent vide ou dupliqué)
      const arrayStructType = reader.fstring(); // "StructProperty"
      const structFieldSize = Number(reader.i64());
      reader.skip(4); // arrayIndex du tag englobant
      const innerStructName = reader.fstring();
      const innerStructGuid = reader.guid();
      reader.skip(1); // byte "HasPropertyGuid" = 0 en général

      for (let i = 0; i < count; i++) {
        items.push(readStructValue(reader, innerStructName, null));
      }
    } else {
      for (let i = 0; i < count; i++) {
        items.push(readInnerValue(reader, innerType));
      }
    }
    return { innerType, items };
  }

  if (type === "MapProperty") {
    const keyType = reader.fstring();
    const valueType = reader.fstring();
    reader.skip(1); // byte "HasPropertyGuid"
    const count = reader.i32();
    const entries = [];
    for (let i = 0; i < count; i++) {
      const key = readInnerValue(reader, keyType);
      const val = readInnerValue(reader, valueType);
      entries.push({ key, value: val });
    }
    return { keyType, valueType, entries };
  }

  if (type === "SetProperty") {
    const innerType = reader.fstring();
    reader.skip(1);
    const count = reader.i32();
    const items = [];
    for (let i = 0; i < count; i++) items.push(readInnerValue(reader, innerType));
    return { innerType, items };
  }

  if (type === "TextProperty") {
    // Structure FText simplifiée : flags + type de source + chaîne.
    reader.skip(4); // flags
    reader.skip(1); // history type
    // Cas le plus courant : chaîne "culture invariant"
    reader.skip(4); // namespace/key count placeholder (best-effort)
    return { __text: true, raw: true };
  }

  // Type non géré explicitement : on laisse `readProperty` retomber sur le
  // fallback "octets bruts" via l'exception.
  throw new Error(`Type de propriété non géré: ${type}`);
}

function readInnerValue(reader, type) {
  if (type === "StructProperty") {
    // Dans un tableau/une map, les structs imbriqués n'ont générablement pas
    // de ré-en-tête complet : on tente une lecture "brute" en tant que
    // propriétés jusqu'à "None", ce qui correspond au cas le plus courant.
    return readPropertiesUntilNone(reader);
  }
  if (type === "IntProperty") return reader.i32();
  if (type === "Int64Property") return Number(reader.i64());
  if (type === "FloatProperty") return reader.f32();
  if (type === "DoubleProperty") return reader.f64();
  if (type === "BoolProperty") return reader.bool();
  if (type === "ByteProperty") return reader.u8();
  if (type === "StrProperty" || type === "NameProperty") return reader.fstring();
  if (type === "ObjectProperty" || type === "SoftObjectProperty") return reader.fstring();
  // fallback : on ne peut pas savoir combien d'octets consommer pour un type
  // inconnu dans ce contexte ; on remonte l'erreur pour déclencher le
  // fallback "octets bruts" au niveau appelant.
  throw new Error(`Type interne (array/map) non géré: ${type}`);
}

/**
 * Structs connus avec une sérialisation "spéciale" (pas une simple liste de
 * propriétés). Les structs non listés ici sont lus comme une liste de
 * propriétés génériques jusqu'à "None" (cas le plus courant côté gameplay).
 */
function readStructValue(reader, structName, declaredSize) {
  switch (structName) {
    case "Guid":
      return { __struct: "Guid", value: reader.guid() };
    case "DateTime":
      return { __struct: "DateTime", value: Number(reader.u64()) };
    case "Timespan":
      return { __struct: "Timespan", value: Number(reader.i64()) };
    case "Vector":
    case "Vector_NetQuantize":
      return { __struct: "Vector", x: reader.f64(), y: reader.f64(), z: reader.f64() };
    case "Quat":
      return { __struct: "Quat", x: reader.f64(), y: reader.f64(), z: reader.f64(), w: reader.f64() };
    case "LinearColor":
      return { __struct: "LinearColor", r: reader.f32(), g: reader.f32(), b: reader.f32(), a: reader.f32() };
    default:
      // Struct "gameplay" générique : une liste de propriétés jusqu'à "None".
      return readPropertiesUntilNone(reader);
  }
}

export function readPropertiesUntilNone(reader) {
  const props = {};
  // Garde-fou anti-boucle infinie si le flux est corrompu : on borne le
  // nombre d'itérations au nombre d'octets restants (pire cas ~1 octet/prop).
  const maxIterations = reader.remaining() + 1;
  let i = 0;
  while (i < maxIterations) {
    let prop;
    try {
      prop = readProperty(reader);
    } catch (err) {
      // Impossible de continuer proprement ce bloc : on remonte ce qu'on a.
      console.warn(`[GVAS] Arrêt anticipé de la lecture des propriétés: ${err.message}`);
      break;
    }
    if (prop === null) break;
    props[prop.name] = prop;
    i++;
  }
  return props;
}
