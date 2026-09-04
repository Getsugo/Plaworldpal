import { state, idToName, SPAWN_LOCATIONS } from "./state.js";
import { renderModeToggle } from "./ui-modeToggle.js";

let lastPal = "";

export function initMapTab() {
  const mapBtn = document.getElementById("map-btn");
  const mapSearch = document.getElementById("map-search");

  mapBtn.addEventListener("click", search);
  mapSearch.addEventListener("keydown", e => { if (e.key === "Enter") search(); });

  refreshMapModeToggle();
}

/** Voir le commentaire équivalent dans ui-breedingTab.js. */
export function refreshMapModeToggle() {
  renderModeToggle(document.getElementById("map-mode-toggle"), () => {
    if (lastPal) search();
  });
}

function search() {
  const mapSearch = document.getElementById("map-search");
  const mapResult = document.getElementById("map-result");

  const pal = mapSearch.value.trim();
  if (!pal) return;
  lastPal = pal;

  const spawns = SPAWN_LOCATIONS[pal] || [];

  if (!spawns.length) {
    mapResult.innerHTML = `<p class="text-amber-300/90">Aucune donnée de spawn pour ce Pal dans la base locale. Complétez data-spawnLocations.js.</p>`;
    return;
  }

  let html = "";

  if (state.viewMode === "save") {
    html += renderCaptureStatus(pal);
  }

  html += spawns.map(s => `
    <div class="bg-[#14201a] border border-emerald-900/60 rounded-xl p-4">
      <b class="text-amber-200">${escapeHtml(s.zone)}</b> — ${dayNightLabel(s.day_night)}
      ${s.note ? `<div class="text-emerald-100/60 text-sm mt-1">${escapeHtml(s.note)}</div>` : ""}
    </div>
  `).join("");

  mapResult.innerHTML = html;
}

function renderCaptureStatus(palName) {
  if (!state.pals.length) {
    return `<p class="text-amber-300/90 mb-2">Importez une sauvegarde pour voir votre statut de capture, ou basculez en mode "Tous les Pals (Global)".</p>`;
  }

  const owned = state.currentPlayerUid
    ? state.pals.filter(p => p.owner_uid === state.currentPlayerUid)
    : state.pals;

  const count = owned.filter(p => idToName[p.species_id] === palName).length;

  return count > 0
    ? `<div class="bg-emerald-900/40 border border-emerald-600/60 rounded-lg p-3 mb-2 text-sm">✅ Déjà capturé — vous en possédez ${count}.</div>`
    : `<div class="bg-amber-900/30 border border-amber-600/50 rounded-lg p-3 mb-2 text-sm">❌ Pas encore capturé dans votre sauvegarde.</div>`;
}

function dayNightLabel(dayNight) {
  return dayNight === "day" ? "🌞 Jour" : dayNight === "night" ? "🌙 Nuit" : "🌗 Jour et nuit";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
