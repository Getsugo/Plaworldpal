// Assistant Élevage Palworld — 100% vanilla JS (ES modules natifs), zéro build.
import { parseSaveFile } from "./saveParser.js";
import { state, persist, resetState, allPalNames } from "./state.js";
import { initCollectionTab, renderCollection } from "./ui-collectionTab.js";
import { initBreedingTab } from "./ui-breedingTab.js";
import { initMapTab } from "./ui-mapTab.js";

document.getElementById("pal-list").innerHTML =
  allPalNames.map(n => `<option value="${n}">`).join("");

// --- Navigation par onglets ------------------------------------------------------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

export function activateTab(name) {
  tabButtons.forEach(b => b.classList.toggle("tab-active", b.dataset.tab === name));
  tabPanels.forEach(p => p.classList.toggle("hidden", p.id !== `tab-${name}`));
  if (name === "collection") renderCollection();
}
tabButtons.forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));

// --- Onglet Import : drag & drop + parsing local --------------------------------
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const importResult = document.getElementById("import-result");
const playerPicker = document.getElementById("player-picker");
const playerSelect = document.getElementById("player-select");
const saveStatus = document.getElementById("save-status");
const resetBtn = document.getElementById("reset-btn");
const logsToggleWrap = document.getElementById("logs-toggle-wrap");
const logsToggle = document.getElementById("logs-toggle");
const logsBox = document.getElementById("logs-box");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("border-amber-400"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("border-amber-400"));
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("border-amber-400");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

logsToggle.addEventListener("click", () => {
  logsBox.classList.toggle("hidden");
  logsToggle.textContent = logsBox.classList.contains("hidden")
    ? "Afficher les logs de parsing"
    : "Masquer les logs de parsing";
});

async function handleFile(file) {
  const logs = [];
  const log = (msg) => { logs.push(msg); logsBox.textContent = logs.join("\n"); };

  logsBox.textContent = "";
  logsToggleWrap.classList.remove("hidden");
  importResult.innerHTML = `<p class="text-emerald-300">Analyse en cours...</p>`;

  try {
    const buffer = await file.arrayBuffer();
    const result = parseSaveFile(buffer, log);

    if (!result.pals.length) {
      importResult.innerHTML = `<p class="text-red-400">❌ Aucun Pal n'a pu être extrait. Consultez les logs de parsing ci-dessous.</p>`;
      logsBox.classList.remove("hidden");
      logsToggle.textContent = "Masquer les logs de parsing";
      return;
    }

    state.pals = result.pals;
    state.players = result.players;
    state.filename = file.name;
    state.currentPlayerUid = result.players[0]?.player_uid || null;
    persist();

    importResult.innerHTML = `<p class="text-emerald-300">✅ ${result.pals.length} Pal(s) et ${result.players.length} joueur(s) extraits avec succès.</p>`;
    saveStatus.textContent = `Sauvegarde : ${file.name}`;
    resetBtn.classList.remove("hidden");
    refreshPlayerPicker();
    activateTab("collection");
  } catch (err) {
    console.error(err);
    importResult.innerHTML = `<p class="text-red-400">❌ ${err.message}</p>`;
    logsBox.classList.remove("hidden");
    logsToggle.textContent = "Masquer les logs de parsing";
  }
}

function refreshPlayerPicker() {
  if (state.players.length > 1) {
    playerSelect.innerHTML = state.players
      .map(p => `<option value="${p.player_uid}">${p.nickname} (${(p.player_uid || "").slice(0, 8)}...)</option>`)
      .join("");
    playerSelect.value = state.currentPlayerUid;
    playerPicker.classList.remove("hidden");
    playerSelect.onchange = () => {
      state.currentPlayerUid = playerSelect.value;
      persist();
      renderCollection();
    };
  } else {
    playerPicker.classList.add("hidden");
  }
}

resetBtn.addEventListener("click", () => {
  if (!confirm("Effacer les données de sauvegarde stockées localement dans ce navigateur ?")) return;
  resetState();
  saveStatus.textContent = "Aucune sauvegarde chargée";
  importResult.innerHTML = "";
  playerPicker.classList.add("hidden");
  resetBtn.classList.add("hidden");
  logsToggleWrap.classList.add("hidden");
  renderCollection();
});

// --- Restauration au chargement ---------------------------------------------------
if (state.filename) {
  saveStatus.textContent = `Sauvegarde : ${state.filename}`;
  resetBtn.classList.remove("hidden");
  refreshPlayerPicker();
}

// --- Initialisation des autres onglets --------------------------------------------
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

activateTab("import");
