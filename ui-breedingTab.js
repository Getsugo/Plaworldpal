import { state, calculator, idToName, SPAWN_LOCATIONS } from "./state.js";

export function initBreedingTab() {
  const targetSearch = document.getElementById("target-search");
  const computeBtn = document.getElementById("compute-btn");

  computeBtn.addEventListener("click", compute);
  targetSearch.addEventListener("keydown", e => { if (e.key === "Enter") compute(); });
}

function compute() {
  const targetSearch = document.getElementById("target-search");
  const breedingResult = document.getElementById("breeding-result");

  const target = targetSearch.value.trim();
  if (!target) return;

  if (!state.pals.length) {
    breedingResult.innerHTML = `<p class="text-amber-300">Importez d'abord une sauvegarde (onglet Import).</p>`;
    return;
  }

  const owned = state.currentPlayerUid
    ? state.pals.filter(p => p.owner_uid === state.currentPlayerUid)
    : state.pals;

  const combos = calculator.findCombosForTarget(target, owned, idToName);
  const spawns = SPAWN_LOCATIONS[target] || [];

  let html = `<h3 class="font-title text-lg text-amber-300">Résultats pour ${escapeHtml(target)}</h3>`;

  if (combos.length) {
    html += `<div class="grid gap-2">` + combos.map(c => `
      <div class="bg-[#14201a] border ${c.special_combo ? "border-amber-500/70" : "border-emerald-900/60"} rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-3 text-sm">
          <span class="font-bold text-sky-300">${escapeHtml(c.parent_a)} ♂</span>
          <span class="text-emerald-400">+</span>
          <span class="font-bold text-pink-300">${escapeHtml(c.parent_b)} ♀</span>
          ${c.special_combo ? `<span class="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">Combo spécial</span>` : ""}
        </div>
        <div class="text-xs text-emerald-100/60">Vous possédez : ${c.owned_count_a} × ${escapeHtml(c.parent_a)} (♂), ${c.owned_count_b} × ${escapeHtml(c.parent_b)} (♀)</div>
      </div>
    `).join("") + `</div>`;
  } else {
    html += `<p class="text-amber-300/90">Aucune combinaison possible avec votre collection actuelle. Consultez les zones de capture ci-dessous.</p>`;
  }

  if (spawns.length) {
    html += `<div class="mt-4"><h4 class="font-title text-amber-200 mb-1">🗺️ Zones de capture</h4>` +
      spawns.map(s => `
        <div class="bg-[#0f1a13] border border-emerald-900/50 rounded-lg p-3 text-sm mb-1">
          <b>${escapeHtml(s.zone)}</b> — ${s.day_night === "day" ? "🌞 Jour" : s.day_night === "night" ? "🌙 Nuit" : "🌗 Jour et nuit"}
          ${s.note ? `<div class="text-emerald-100/60 text-xs">${escapeHtml(s.note)}</div>` : ""}
        </div>
      `).join("") + `</div>`;
  }

  breedingResult.innerHTML = html;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
