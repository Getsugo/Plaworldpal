import { BreedingCalculator } from "./breedingCalculator.js";
import { palsDatabase } from "./data-palsDatabase.js";
import { specialCombos } from "./data-specialCombos.js";
import { spawnLocations } from "./data-spawnLocations.js";

const LS_KEYS = {
  pals: "palworld_breeding_pals",
  players: "palworld_breeding_players",
  currentUid: "palworld_breeding_current_uid",
  filename: "palworld_breeding_filename",
  viewMode: "palworld_breeding_view_mode",
  manualOwned: "palworld_breeding_manual_owned",
};

export const state = {
  pals: JSON.parse(localStorage.getItem(LS_KEYS.pals) || "[]"),
  players: JSON.parse(localStorage.getItem(LS_KEYS.players) || "[]"),
  currentPlayerUid: localStorage.getItem(LS_KEYS.currentUid) || null,
  filename: localStorage.getItem(LS_KEYS.filename) || null,
  // "global"  : explore tous les Pals du jeu, sans sauvegarde chargée.
  // "save"    : filtre sur les Pals réellement possédés (sauvegarde + pointage manuel).
  // Par défaut "global" si rien n'est chargé (voir aussi forceViewModeConsistency()).
  viewMode: localStorage.getItem(LS_KEYS.viewMode) || "global",
  // Pointage manuel : { "Lamball": true, "Anubis": true, ... } — un simple
  // "je l'ai / je ne l'ai pas", indépendant du parsing de sauvegarde, pour
  // les cas où l'import automatique ne fonctionne pas (ex: format de
  // compression non supporté par le décodeur navigateur) ou simplement par
  // préférence.
  manualOwned: JSON.parse(localStorage.getItem(LS_KEYS.manualOwned) || "{}"),
};

export function persist() {
  localStorage.setItem(LS_KEYS.pals, JSON.stringify(state.pals));
  localStorage.setItem(LS_KEYS.players, JSON.stringify(state.players));
  if (state.currentPlayerUid) localStorage.setItem(LS_KEYS.currentUid, state.currentPlayerUid);
  else localStorage.removeItem(LS_KEYS.currentUid);
  if (state.filename) localStorage.setItem(LS_KEYS.filename, state.filename);
  else localStorage.removeItem(LS_KEYS.filename);
  localStorage.setItem(LS_KEYS.viewMode, state.viewMode);
  localStorage.setItem(LS_KEYS.manualOwned, JSON.stringify(state.manualOwned));
}

export function resetState() {
  state.pals = [];
  state.players = [];
  state.currentPlayerUid = null;
  state.filename = null;
  state.viewMode = "global";
  // Le pointage manuel n'est PAS effacé par un reset de sauvegarde — c'est
  // une source de données indépendante, que l'utilisateur a saisie lui-même.
  persist();
}

/** Bascule simple "je l'ai / je ne l'ai pas" — pas de quantité à gérer. */
export function setManualOwned(name, owned) {
  if (!owned) delete state.manualOwned[name];
  else state.manualOwned[name] = true;
  persist();
}

/**
 * Garantit la cohérence du mode d'affichage : le mode "save" n'a de sens
 * que s'il y a AU MOINS UNE source de données de possession (sauvegarde
 * importée OU pointage manuel) — sinon on force "global".
 */
export function forceViewModeConsistency() {
  const hasAnyOwnershipData = state.pals.length > 0 || Object.keys(state.manualOwned).length > 0;
  if (!hasAnyOwnershipData && state.viewMode === "save") {
    state.viewMode = "global";
    persist();
  }
}

// --- Bases de données statiques (modules JS, pas de fetch — fonctionne aussi
// bien via file:// qu'hébergé) --------------------------------------------------
export const calculator = new BreedingCalculator(palsDatabase, specialCombos);

export const idToName = {};
for (const p of palsDatabase.pals) {
  for (const internalId of p.internal_ids || []) {
    idToName[internalId] = p.name;
  }
}
export const allPalNames = palsDatabase.pals.map(p => p.name);
export const SPAWN_LOCATIONS = spawnLocations.spawns;

/** Résout le nom d'un Pal possédé, qu'il vienne d'une sauvegarde réelle ou
 * d'une entrée manuelle synthétique (voir getEffectiveOwnedPals). */
export function resolveOwnedPalName(pal) {
  return pal.__manualName || idToName[pal.species_id];
}

/** Compte combiné (sauvegarde + pointage manuel) par nom de Pal — pour
 * l'affichage du statut de capture (Collection, Carte). Le pointage manuel
 * ajoute 1 (présence/absence, pas de quantité). */
export function getOwnedCountByName(scopeToCurrentPlayer = true) {
  const fromSave = scopeToCurrentPlayer && state.currentPlayerUid
    ? state.pals.filter(p => p.owner_uid === state.currentPlayerUid)
    : state.pals;

  const counts = {};
  for (const p of fromSave) {
    const name = idToName[p.species_id];
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  for (const name of Object.keys(state.manualOwned)) {
    if (!state.manualOwned[name]) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

/**
 * Pals "effectifs" pour le calculateur d'élevage : instances réelles de la
 * sauvegarde + entrées synthétiques pour le pointage manuel. Un Pal pointé
 * manuellement est traité comme ayant au moins un mâle ET une femelle
 * disponibles — simplification nécessaire puisque le pointage manuel est
 * un simple "je l'ai / je ne l'ai pas", sans détail de sexe.
 */
export function getEffectiveOwnedPals(scopeToCurrentPlayer = true) {
  const fromSave = scopeToCurrentPlayer && state.currentPlayerUid
    ? state.pals.filter(p => p.owner_uid === state.currentPlayerUid)
    : state.pals;

  const synthetic = [];
  for (const name of Object.keys(state.manualOwned)) {
    if (!state.manualOwned[name]) continue;
    synthetic.push({ instance_id: `manual-${name}-M`, species_id: null, __manualName: name, gender: "Male", owner_uid: null });
    synthetic.push({ instance_id: `manual-${name}-F`, species_id: null, __manualName: name, gender: "Female", owner_uid: null });
  }
  return [...fromSave, ...synthetic];
}
