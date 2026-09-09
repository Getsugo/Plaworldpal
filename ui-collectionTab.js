import { state, idToName, allPalNames, calculator } from "./state.js";
import { renderModeToggle } from "./ui-modeToggle.js";

let lastOwnedCollection = [];
let currentFilterText = "";

/**
 * ⚠️ Portraits de Pals : je ne peux pas les fournir moi-même. Ce sont des
 * illustrations de personnages sous droits d'auteur de Pocketpair — je ne
 * les génère pas (reproduction de personnages protégés) et je ne les
 * récupère pas sur un site tiers pour les intégrer par défaut ici (même
 * raisonnement que pour l'image de la carte du monde : je ne fais pas de
 * la redistribution d'assets protégés un comportement par défaut de ce que
 * je livre).
 *
 * Ce qui EST fait : chaque carte cherche une image à un emplacement
 * prévisible, et si elle n'existe pas, un avatar de repli (initiale
 * colorée) s'affiche proprement à la place — jamais de case cassée/vide.
 *
 * Pour activer les vraies images : déposez vos fichiers (obtenus par vos
 * propres moyens — capture d'écran personnelle, extraction de VOTRE copie
 * du jeu, source dont vous avez vérifié les droits...) à la racine du
 * projet, au format :
 *   pal-icon-<nom-en-minuscules-avec-tirets>.webp
 * Exemples : pal-icon-lamball.webp, pal-icon-lyleen-noct.webp
 * Rien à changer dans le code, l'image s'affiche dès qu'elle est présente.
 */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function palIconUrl(name) {
  return `./pal-icon-${slugify(name)}.webp`;
}

// Utilisé par l'attribut onerror inline des <img> (portée globale requise
// pour les gestionnaires d'évènements HTML inline).
window.__palIconFallback = function (imgEl) {
  imgEl.style.display = "none";
  const fallback = imgEl.nextElementSibling;
  if (fallback) fallback.classList.remove("hidden");
};

function portraitHtml(name, captured) {
  const letter = name.trim().charAt(0).toUpperCase();
  const ringColor = captured ? "border-emerald-500" : "border-slate-700";
  const fallbackStyle = captured
    ? "bg-emerald-900/60 text-emerald-200"
    : "bg-slate-800/60 text-slate-500";
  return `
    <div class="relative w-14 h-14 mx-auto mb-1">
      <img src="${palIconUrl(name)}" alt="" loading="lazy"
           class="w-14 h-14 rounded-full object-cover border-2 ${ringColor} bg-black/30"
           onerror="window.__palIconFallback(this)">
      <div class="pal-icon-fallback hidden absolute inset-0 w-14 h-14 rounded-full items-center justify-center text-lg font-title font-bold border-2 ${ringColor} ${fallbackStyle}">
        ${escapeHtml(letter)}
      </div>
    </div>
  `;
}

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
    <div class="pal-card bg-[#14201a] border border-emerald-900/60 rounded-xl p-3 text-center">
      ${portraitHtml(p.species_name, true)}
      <div class="flex items-center justify-center gap-1.5">
        <span class="font-bold text-amber-200 text-sm">${escapeHtml(p.species_name)}</span>
        <span class="text-xs ${p.gender === "Female" ? "text-pink-300" : "text-sky-300"}">${p.gender === "Female" ? "♀" : p.gender === "Male" ? "♂" : "?"}</span>
      </div>
      ${p.nickname ? `<div class="text-xs text-emerald-100/60 italic">"${escapeHtml(p.nickname)}"</div>` : ""}
      ${p.is_lucky ? `<div class="text-xs text-amber-400">✨ Lucky</div>` : ""}
      ${p.passives && p.passives.length ? `<div class="mt-1 flex flex-wrap gap-1 justify-center">${p.passives.map(pa => `<span class="text-[10px] bg-emerald-900/70 px-1.5 py-0.5 rounded">${escapeHtml(pa)}</span>`).join("")}</div>` : ""}
      ${actionButtonsHtml(p.species_name)}
    </div>
  `).join("");
}

// --- Mode "Tous les Pals (Global)" : Paldex complet, capturé ou non -----------
function renderPaldexMode(warningBox) {
  const rankedCount = allPalNames.filter(n => calculator.hasKnownRank(n)).length;
  warningBox.textContent =
    `Paldex complet (${allPalNames.length} Pals, identification via Pal Atlas) — ${rankedCount} avec un rang ` +
    `d'élevage vérifié (utilisables dans le calculateur), les autres identifiables/capturables mais pas encore élevables. ` +
    `Portraits : déposez vos propres images "pal-icon-<nom>.webp" à la racine (voir commentaire en tête de ui-collectionTab.js).`;

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
    const ranked = calculator.hasKnownRank(name);
    return `
      <div class="pal-card rounded-xl p-3 border text-center ${captured ? "bg-[#14201a] border-emerald-700/70" : "bg-black/20 border-slate-800"}">
        ${portraitHtml(name, captured)}
        <div class="flex items-center justify-center gap-1.5 flex-wrap">
          <span class="font-bold text-sm ${captured ? "text-amber-200" : "text-slate-500"}">${escapeHtml(name)}</span>
        </div>
        <div class="mt-1">
          ${
            captured
              ? `<span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">✅ ×${count}</span>`
              : `<span class="text-[10px] text-slate-500 whitespace-nowrap">🔒 Non capturé</span>`
          }
        </div>
        ${ranked ? "" : `<div class="text-[9px] text-slate-500 mt-0.5">⚠️ rang d'élevage inconnu</div>`}
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
