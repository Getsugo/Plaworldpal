// Assistant Élevage Palworld — 100% vanilla JS (ES modules natifs), zéro build.
// L'onglet Import (parsing de sauvegarde .sav) a été retiré : le pointage
// manuel (onglet Collection) est la seule source de possession désormais.
// Le moteur de parsing (saveParser.js, gvas-*.js) reste disponible dans
// l'historique du projet si vous voulez le réintégrer plus tard (utile pour
// les sauvegardes en zlib/"PlZ" — seules celles en Oodle/"PlM" posent
// problème, voir les échanges précédents).
import { state } from "./state.js";
import { initCollectionTab, renderCollection } from "./ui-collectionTab.js";
import { initBreedingTab, refreshBreedingModeToggle } from "./ui-breedingTab.js";
import { initMapTab, refreshMapModeToggle } from "./ui-mapTab.js";

// --- Navigation par onglets ------------------------------------------------------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const saveStatus = document.getElementById("save-status");

export function activateTab(name) {
  tabButtons.forEach(b => b.classList.toggle("tab-active", b.dataset.tab === name));
  tabPanels.forEach(p => p.classList.toggle("hidden", p.id !== `tab-${name}`));
  // Chaque onglet re-synchronise son affichage avec l'état courant à chaque
  // activation (utile notamment pour que le commutateur Global/Sauvegarde
  // reflète toujours la présence ou non de Pals pointés manuellement).
  refreshSaveStatus();
  if (name === "collection") renderCollection();
  if (name === "breeding") refreshBreedingModeToggle();
  if (name === "map") refreshMapModeToggle();
}
tabButtons.forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));

function refreshSaveStatus() {
  const manualCount = Object.keys(state.manualOwned).length;
  saveStatus.textContent = manualCount > 0
    ? `Pointage manuel actif (${manualCount} Pal${manualCount > 1 ? "s" : ""})`
    : "Aucun Pal pointé";
}

// --- Initialisation des onglets -----------------------------------------------
initCollectionTab();
initBreedingTab();
initMapTab();

// --- Service worker (PWA installable + hors-ligne) --------------------------------
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* L'app reste utilisable sans SW, juste sans mode hors-ligne. */
    });
  });
}

activateTab("collection");
