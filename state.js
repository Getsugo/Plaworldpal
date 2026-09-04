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
};

export const state = {
  pals: JSON.parse(localStorage.getItem(LS_KEYS.pals) || "[]"),
  players: JSON.parse(localStorage.getItem(LS_KEYS.players) || "[]"),
  currentPlayerUid: localStorage.getItem(LS_KEYS.currentUid) || null,
  filename: localStorage.getItem(LS_KEYS.filename) || null,
  // "global"  : explore tous les Pals du jeu, sans sauvegarde chargée.
  // "save"    : filtre sur les Pals réellement possédés.
  // Par défaut "global" si rien n'est chargé (voir aussi forceViewModeConsistency()).
  viewMode: localStorage.getItem(LS_KEYS.viewMode) || "global",
};

export function persist() {
  localStorage.setItem(LS_KEYS.pals, JSON.stringify(state.pals));
  localStorage.setItem(LS_KEYS.players, JSON.stringify(state.players));
  if (state.currentPlayerUid) localStorage.setItem(LS_KEYS.currentUid, state.currentPlayerUid);
  else localStorage.removeItem(LS_KEYS.currentUid);
  if (state.filename) localStorage.setItem(LS_KEYS.filename, state.filename);
  else localStorage.removeItem(LS_KEYS.filename);
  localStorage.setItem(LS_KEYS.viewMode, state.viewMode);
}

export function resetState() {
  state.pals = [];
  state.players = [];
  state.currentPlayerUid = null;
  state.filename = null;
  state.viewMode = "global";
  persist();
}

/**
 * Garantit la cohérence du mode d'affichage : si aucune sauvegarde n'est
 * chargée, le mode "save" n'a pas de sens -> on force "global". À appeler
 * après tout changement de `state.pals` (import, reset).
 */
export function forceViewModeConsistency() {
  if (state.pals.length === 0 && state.viewMode === "save") {
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
