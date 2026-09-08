import { state, idToName, allPalNames } from "./state.js";
import { renderModeToggle } from "./ui-modeToggle.js";

let lastOwnedCollection = [];
let currentFilterText = "";

export function initCollectionTab() {
  const filterInput = document.getElementById("collection-filter");
  filterInput.addEventListener("input", () => {
    currentFilterText = filterInput.value;
    renderCurrentMode();
  });

  // Délégation d'événements : le conteneur reste le même à travers les
  // re-rendus (seul son innerHTML change), donc un seul listener posé une
  // fois suffit pour tous les boutons "🥚 Élevage" / "🗺️ Carte" des cartes,
  // même celles générées après ce point.
  document.getElementById("collection-grid").addEventListener("click", e => {
    const btn = e.target.closest("[data-goto]");
    if (!btn) return;
    const palName = btn.dataset.pal;
    if (btn.dataset.goto === "breeding") goToBreeding(palName);
    else if (btn.dataset.goto === "map") goToMap(palName);
  });

  refreshCollectionModeToggle();
}

/** Voir le commentaire équivalent dans ui-breedingTab.js / ui-mapTab.js —
 * recalcule à chaque activation de l'onglet (garantit la règle "pas de
 * sauvegarde -> mode Global forcé"). */
export function refreshCollectionModeToggle() {
  renderModeToggle(document.getElementById("collection-mode-toggle"), () => {
    renderCurrentMode();
  });
}

// Conservé pour compatibilité avec app.js (appelé après import/reset et à
// l'activation de l'onglet) : re-rend le commutateur ET le contenu.
export function renderCollection() {
  refreshCollectionModeToggle();
}

function renderCurrentMode() {
  const warningBox = document.getElementById("collection-warning");
  if (state.viewMode === "save") {
    renderOwnedMode(warningBox);
  } else {
    renderPaldexMode(warningBox);
  }
}

// --- Navigation vers les autres onglets, un Pal donné pré-rempli --------------
// On passe par un clic simulé sur les boutons d'onglet / de recherche déjà
// câblés dans app.js / ui-breedingTab.js / ui-mapTab.js plutôt que d'importer
// ces modules directement : ça évite toute dépendance circulaire (le même
// principe que l'état partagé dans state.js).
function goToBreeding(palName) {
  const tabBtn = document.querySelector('.tab-btn[data-tab="breeding"]');
  if (tabBtn) tabBtn.click();

  const input = document.getElementById("target-search");
  const computeBtn = document.getElementById("compute-btn");
  if (input && computeBtn) {
    input.value = palName;
    computeBtn.click();
  }
}

function goToMap(palName) {
  const tabBtn = document.querySelector('.tab-btn[data-tab="map"]');
  if (tabBtn) tabBtn.click();

  const input = document.getElementById("map-search");
  const mapBtn = document.getElementById("map-btn");
  if (input && mapBtn) {
    input.value = palName;
    mapBtn.click();
  }
}

function actionButtonsHtml(palName) {
  const safeName = escapeHtml(palName);
  return `
    <div class="flex gap-1 mt-2">
      <button type="button" data-goto="breeding" data-pal="${safeName}" class="flex-1 text-[10px] bg-amber-500/15 hover:bg-amber-500/35 text-amber-200 rounded px-2 py-1 transition">🥚 Élevage</button>
      <button type="button" data-goto="map" data-pal="${safeName}" class="flex-1 text-[10px] bg-purple-500/15 hover:bg-purple-500/35 text-purple-200 rounded px-2 py-1 transition">🗺️ Carte</button>
    </div>
  `;
}

// --- Mode "Mes Pals (Sauvegarde)" : instances réellement possédées ------------
function renderOwnedMode(warningBox) {
  const grid = document.getElementById("collection-grid");

  if (!state.pals.length) {
    grid.innerHTML = `<p class="text-emerald-200/60 col-span-full">Importez d'abord une sauvegarde (onglet Import), ou consultez le Paldex complet en mode "Tous les Pals".</p>`;
    warningBox.textContent = "";
    lastOwnedCollection = [];
    return;
  }

  const scoped = state.currentPlayerUid
    ? state.pals.filter(p => p.owner_uid === state.currentPlayerUid)
    : state.pals;

  const unresolved = new Set();
  lastOwnedCollection = scoped.map(p => {
    const name = idToName[p.species_id];
    if (!name) unresolved.add(p.species_id);
    return { ...p, species_name: name || `[Inconnu: ${p.species_id}]` };
  });

  warningBox.textContent = unresolved.size
    ? `${unresolved.size} espèce(s) non reconnue(s) : ${[...unresolved].join(", ")}. Ajoutez leur CharacterID dans data-palsDatabase.js.`
    : "";

  renderOwnedFiltered();
}

function renderOwnedFiltered() {
  const grid = document.getElementById("collection-grid");
  const filtered = lastOwnedCollection.filter(p =>
    p.species_name.toLowerCase().includes(currentFilterText.toLowerCase())
  );

  if (!filtered.length) {
    grid.innerHTML = `<p class="text-emerald-200/60 col-span-full">Aucun Pal trouvé.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="pal-card bg-[#14201a] border border-emerald-900/60 rounded-xl p-3">
      <div class="flex items-center justify-between">
        <span class="font-bold text-amber-200 text-sm">${escapeHtml(p.species_name)}</span>
        <span class="text-xs ${p.gender === "Female" ? "text-pink-300" : "text-sky-300"}">${p.gender === "Female" ? "♀" : p.gender === "Male" ? "♂" : "?"}</span>
      </div>
      ${p.nickname ? `<div class="text-xs text-emerald-100/60 italic">"${escapeHtml(p.nickname)}"</div>` : ""}
      ${p.is_lucky ? `<div class="text-xs text-amber-400">✨ Lucky</div>` : ""}
      ${p.passives && p.passives.length ? `<div class="mt-1 flex flex-wrap gap-1">${p.passives.map(pa => `<span class="text-[10px] bg-emerald-900/70 px-1.5 py-0.5 rounded">${escapeHtml(pa)}</span>`).join("")}</div>` : ""}
      ${actionButtonsHtml(p.species_name)}
    </div>
  `).join("");
}

// --- Mode "Tous les Pals (Global)" : Paldex complet, capturé ou non -----------
function renderPaldexMode(warningBox) {
  warningBox.textContent =
    `Paldex de la base d'élevage (${allPalNames.length} Pals) — pas encore l'intégralité des ~150 Pals ` +
    `du jeu (seuls ceux avec un CharacterID connu peuvent être détectés comme "capturés").`;

  const scoped = state.currentPlayerUid
    ? state.pals.filter(p => p.owner_uid === state.currentPlayerUid)
    : state.pals;

  const ownedCountByName = {};
  for (const p of scoped) {
    const name = idToName[p.species_id];
    if (!name) continue;
    ownedCountByName[name] = (ownedCountByName[name] || 0) + 1;
  }

  const filteredNames = allPalNames
    .filter(n => n.toLowerCase().includes(currentFilterText.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const grid = document.getElementById("collection-grid");
  if (!filteredNames.length) {
    grid.innerHTML = `<p class="text-emerald-200/60 col-span-full">Aucun Pal trouvé.</p>`;
    return;
  }

  grid.innerHTML = filteredNames.map(name => {
    const count = ownedCountByName[name] || 0;
    const captured = count > 0;
    return `
      <div class="pal-card rounded-xl p-3 border ${captured ? "bg-[#14201a] border-emerald-700/70" : "bg-black/20 border-slate-800"}">
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-sm ${captured ? "text-amber-200" : "text-slate-500"}">${escapeHtml(name)}</span>
          ${
            captured
              ? `<span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">✅ ×${count}</span>`
              : `<span class="text-[10px] text-slate-500 whitespace-nowrap">🔒 Non capturé</span>`
          }
        </div>
        ${actionButtonsHtml(name)}
      </div>
    `;
  }).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
