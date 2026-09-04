import { state, idToName } from "./state.js";

let lastCollection = [];

export function initCollectionTab() {
  const filterInput = document.getElementById("collection-filter");
  filterInput.addEventListener("input", () => renderFiltered(filterInput.value));
}

export function renderCollection() {
  const grid = document.getElementById("collection-grid");
  const warningBox = document.getElementById("collection-warning");

  if (!state.pals.length) {
    grid.innerHTML = `<p class="text-emerald-200/60 col-span-full">Importez d'abord une sauvegarde (onglet Import).</p>`;
    warningBox.textContent = "";
    lastCollection = [];
    return;
  }

  const scoped = state.currentPlayerUid
    ? state.pals.filter(p => p.owner_uid === state.currentPlayerUid)
    : state.pals;

  const unresolved = new Set();
  lastCollection = scoped.map(p => {
    const name = idToName[p.species_id];
    if (!name) unresolved.add(p.species_id);
    return { ...p, species_name: name || `[Inconnu: ${p.species_id}]` };
  });

  warningBox.textContent = unresolved.size
    ? `${unresolved.size} espèce(s) non reconnue(s) : ${[...unresolved].join(", ")}. Ajoutez leur CharacterID dans data-palsDatabase.js.`
    : "";

  renderFiltered(document.getElementById("collection-filter").value || "");
}

function renderFiltered(filterText) {
  const grid = document.getElementById("collection-grid");
  const filtered = lastCollection.filter(p =>
    p.species_name.toLowerCase().includes(filterText.toLowerCase())
  );

  if (!filtered.length) {
    grid.innerHTML = `<p class="text-emerald-200/60 col-span-full">Aucun Pal trouvé.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="pal-card bg-[#14201a] border border-emerald-900/60 rounded-xl p-3">
      <div class="flex items-center justify-between">
        <span class="font-bold text-amber-200 text-sm">${p.species_name}</span>
        <span class="text-xs ${p.gender === "Female" ? "text-pink-300" : "text-sky-300"}">${p.gender === "Female" ? "♀" : p.gender === "Male" ? "♂" : "?"}</span>
      </div>
      ${p.nickname ? `<div class="text-xs text-emerald-100/60 italic">"${escapeHtml(p.nickname)}"</div>` : ""}
      ${p.is_lucky ? `<div class="text-xs text-amber-400">✨ Lucky</div>` : ""}
      ${p.passives && p.passives.length ? `<div class="mt-1 flex flex-wrap gap-1">${p.passives.map(pa => `<span class="text-[10px] bg-emerald-900/70 px-1.5 py-0.5 rounded">${escapeHtml(pa)}</span>`).join("")}</div>` : ""}
    </div>
  `).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
