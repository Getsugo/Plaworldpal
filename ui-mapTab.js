import { state, idToName, SPAWN_LOCATIONS } from "./state.js";
import { renderModeToggle } from "./ui-modeToggle.js";

// `L` est fourni par le script Leaflet chargé via CDN dans index.html
// (balise <script> classique, pas un module — donc disponible en global).

/**
 * ⚠️ Le fond de carte (map-placeholder.svg) est un placeholder stylisé
 * généré pour ce projet, PAS une reproduction de la carte officielle de
 * Palworld (droits d'auteur du jeu). Remplacez ce fichier par votre propre
 * image si vous en avez une sous licence libre, en gardant les mêmes
 * dimensions (carrée) ou en ajustant MAP_SIZE ci-dessous.
 *
 * ⚠️ ZONE_COORDINATES ci-dessous place chaque zone à une position
 * APPROXIMATIVE sur ce placeholder (calée sur les régions dessinées dans le
 * SVG) — ce n'est pas un système de coordonnées in-game vérifié. Si vous
 * avez les vraies coordonnées d'apparition, ajustez simplement les valeurs
 * {x, y} correspondantes (0-1000 sur chaque axe).
 */
const MAP_IMAGE_URL = "./map-placeholder.svg";
const MAP_SIZE = 1000;

const ZONE_COORDINATES = {
  "Windswept Hills": { x: 500, y: 600 },
  "Verdant Brook": { x: 250, y: 550 },
  "Deep Sand Dunes": { x: 760, y: 580 },
  "Mount Obsidian": { x: 700, y: 800 },
  "Astral Mountains": { x: 500, y: 300 },
  "Iceberg Wasteland": { x: 500, y: 100 },
  "Volcanic Island": { x: 920, y: 380 },
};

// Zones composites ("A / B" ou "A (précision)") : on rattache au premier
// mot-clé de zone de base reconnu dans la chaîne, avec un léger décalage
// déterministe pour ne pas superposer exactement plusieurs marqueurs.
function getZoneCoordinates(zoneName) {
  if (ZONE_COORDINATES[zoneName]) return ZONE_COORDINATES[zoneName];

  for (const [baseName, coords] of Object.entries(ZONE_COORDINATES)) {
    if (zoneName.includes(baseName)) {
      const jitter = hashJitter(zoneName);
      return { x: coords.x + jitter.dx, y: coords.y + jitter.dy };
    }
  }

  if (zoneName.includes("Sea Breeze")) return { x: 300, y: 920 };

  // Zone totalement inconnue : position déterministe (toujours la même
  // pour un même nom) plutôt qu'aléatoire, quelque part sur la carte.
  const jitter = hashJitter(zoneName);
  return { x: 500 + jitter.dx * 4, y: 500 + jitter.dy * 4 };
}

function hashJitter(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return { dx: (hash % 61) - 30, dy: ((hash >> 8) % 61) - 30 };
}

const DAY_NIGHT_COLORS = { day: "#fbbf24", night: "#818cf8", both: "#34d399" };
const DAY_NIGHT_LABELS = { day: "🌞 Jour", night: "🌙 Nuit", both: "🌗 Jour et nuit" };

let leafletMap = null;
let markersLayer = null;
let dayNightFilter = "both"; // "both" = pas de filtre, on montre tout
let lastPal = "";

export function initMapTab() {
  const mapBtn = document.getElementById("map-btn");
  const mapSearch = document.getElementById("map-search");

  mapBtn.addEventListener("click", () => searchAndPlot(mapSearch.value.trim()));
  mapSearch.addEventListener("keydown", e => { if (e.key === "Enter") searchAndPlot(mapSearch.value.trim()); });

  document.querySelectorAll(".daynight-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      dayNightFilter = btn.dataset.filter;
      document.querySelectorAll(".daynight-filter-btn").forEach(b => {
        const active = b.dataset.filter === dayNightFilter;
        b.classList.toggle("bg-amber-400", active);
        b.classList.toggle("text-[#1a1207]", active);
        b.classList.toggle("text-emerald-100/60", !active);
      });
      if (lastPal) plotPalOnMap(lastPal);
    });
  });

  refreshMapModeToggle();
}

/** Voir le commentaire équivalent dans ui-breedingTab.js — recalcule à chaque activation de l'onglet. */
export function refreshMapModeToggle() {
  renderModeToggle(document.getElementById("map-mode-toggle"), () => {
    if (lastPal) plotPalOnMap(lastPal);
  });

  ensureLeafletMap();
  // Le conteneur peut avoir été cité alors qu'il était caché (onglet
  // inactif) : on force Leaflet à recalculer sa taille à chaque activation.
  if (leafletMap) leafletMap.invalidateSize();
}

function ensureLeafletMap() {
  if (leafletMap || typeof L === "undefined") return;

  const bounds = [[0, 0], [MAP_SIZE, MAP_SIZE]];
  leafletMap = L.map("leaflet-map-container", {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomSnap: 0.25,
    attributionControl: false,
  });
  L.imageOverlay(MAP_IMAGE_URL, bounds).addTo(leafletMap);
  leafletMap.fitBounds(bounds);
  markersLayer = L.layerGroup().addTo(leafletMap);
}

function searchAndPlot(palName) {
  if (!palName) return;
  lastPal = palName;
  plotPalOnMap(palName);
}

function plotPalOnMap(palName) {
  const mapStatus = document.getElementById("map-status");
  ensureLeafletMap();

  if (!leafletMap) {
    mapStatus.textContent = "Leaflet.js n'a pas pu se charger (vérifiez votre connexion internet — la carte a besoin du CDN unpkg.com).";
    return;
  }

  markersLayer.clearLayers();

  const allSpawns = SPAWN_LOCATIONS[palName] || [];
  const spawns = allSpawns.filter(s => dayNightFilter === "both" || s.day_night === dayNightFilter || s.day_night === "both");

  if (!allSpawns.length) {
    mapStatus.innerHTML = `<p class="text-amber-300/90">Aucune donnée de spawn pour "${escapeHtml(palName)}" dans la base locale. Complétez data-spawnLocations.js.</p>`;
    return;
  }

  if (!spawns.length) {
    mapStatus.innerHTML = `<p class="text-amber-300/90">Aucune apparition connue pour ce filtre (${DAY_NIGHT_LABELS[dayNightFilter]}). Essayez "Les deux".</p>`;
    return;
  }

  let captureHtml = "";
  if (state.viewMode === "save") {
    captureHtml = renderCaptureStatus(palName);
  }
  mapStatus.innerHTML = captureHtml;

  const bounds = [];
  for (const spawn of spawns) {
    const { x, y } = getZoneCoordinates(spawn.zone);
    // Conversion : notre repère (x=colonne, y=ligne, origine en haut) vers
    // celui de Leaflet/CRS.Simple (origine en bas) -> on inverse l'axe Y.
    const latlng = [MAP_SIZE - y, x];
    bounds.push(latlng);

    const color = DAY_NIGHT_COLORS[spawn.day_night] || DAY_NIGHT_COLORS.both;
    const marker = L.circleMarker(latlng, {
      radius: 10,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2,
    });

    const popupLines = [
      `<b>${escapeHtml(spawn.zone)}</b>`,
      DAY_NIGHT_LABELS[spawn.day_night] || DAY_NIGHT_LABELS.both,
    ];
    if (spawn.level) popupLines.push(`Niveau approx. : ${escapeHtml(String(spawn.level))}`);
    if (spawn.note) popupLines.push(`<span style="opacity:.75">${escapeHtml(spawn.note)}</span>`);

    marker.bindPopup(popupLines.join("<br>"));
    marker.addTo(markersLayer);
  }

  if (bounds.length === 1) {
    leafletMap.setView(bounds[0], 0);
  } else {
    leafletMap.fitBounds(bounds, { padding: [40, 40] });
  }
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
