import { SPAWN_LOCATIONS } from "./state.js";

export function initMapTab() {
  const mapBtn = document.getElementById("map-btn");
  const mapSearch = document.getElementById("map-search");

  mapBtn.addEventListener("click", search);
  mapSearch.addEventListener("keydown", e => { if (e.key === "Enter") search(); });
}

function search() {
  const mapSearch = document.getElementById("map-search");
  const mapResult = document.getElementById("map-result");

  const pal = mapSearch.value.trim();
  if (!pal) return;

  const spawns = SPAWN_LOCATIONS[pal] || [];
  if (!spawns.length) {
    mapResult.innerHTML = `<p class="text-amber-300/90">Aucune donnée de spawn pour ce Pal dans la base locale. Complétez data-spawnLocations.js.</p>`;
    return;
  }

  mapResult.innerHTML = spawns.map(s => `
    <div class="bg-[#14201a] border border-emerald-900/60 rounded-xl p-4">
      <b class="text-amber-200">${escapeHtml(s.zone)}</b> — ${s.day_night === "day" ? "🌞 Jour" : s.day_night === "night" ? "🌙 Nuit" : "🌗 Jour et nuit"}
      ${s.note ? `<div class="text-emerald-100/60 text-sm mt-1">${escapeHtml(s.note)}</div>` : ""}
    </div>
  `).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
