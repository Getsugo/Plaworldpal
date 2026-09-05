import { state, idToName, SPAWN_LOCATIONS } from "./state.js";
import { renderModeToggle } from "./ui-modeToggle.js";

// `L` est fourni par le script Leaflet chargé via CDN dans index.html
// (balise <script> classique, pas un module — donc disponible en global).

/**
 * ⚠️ Image de fond de la carte.
 *
 * Je n'ai pas pu vérifier qu'une URL d'image communautaire "haute
 * résolution" spécifique soit stable/en ligne (le dépôt donné en exemple
 * n'a pas pu être confirmé accessible), et je ne veux pas coder en dur une
 * source non vérifiée qui casserait la carte au premier chargement. Le
 * fallback ci-dessous (map-placeholder.svg, un fond stylisé généré pour ce
 * projet, sans droits d'auteur) reste donc la valeur par défaut.
 *
 * Pour brancher une vraie image de carte (capture personnelle, carte
 * communautaire dont vous avez vérifié la licence/disponibilité...) :
 * remplacez simplement la ligne ci-dessous par l'URL de votre choix. En cas
 * d'échec de chargement, le code bascule automatiquement sur le placeholder
 * (voir `imageOverlay.on("error", ...)` plus bas) — donc rien ne casse même
 * si l'URL devient indisponible.
 */
const MAP_IMAGE_URL = "./map-placeholder.svg";
// Exemple pour brancher une image externe (à vérifier vous-même avant usage) :
// const MAP_IMAGE_URL = "https://raw.githubusercontent.com/mapgenie/palworld-map/main/map.jpg";
const FALLBACK_MAP_IMAGE_URL = "./map-placeholder.svg";

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

function getZoneCoordinates(zoneName) {
  if (ZONE_COORDINATES[zoneName]) return ZONE_COORDINATES[zoneName];

  for (const [baseName, coords] of Object.entries(ZONE_COORDINATES)) {
    if (zoneName.includes(baseName)) {
      const jitter = hashJitter(zoneName);
      return { x: coords.x + jitter.dx, y: coords.y + jitter.dy };
    }
  }
  if (zoneName.includes("Sea Breeze")) return { x: 300, y: 920 };

  const jitter = hashJitter(zoneName);
  return { x: 500 + jitter.dx * 4, y: 500 + jitter.dy * 4 };
}

function hashJitter(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return { dx: (hash % 61) - 30, dy: ((hash >> 8) % 61) - 30 };
}

// Palette demandée : orange = jour, bleu = nuit, violet = les deux.
const DAY_NIGHT_COLORS = { day: "#f97316", night: "#3b82f6", both: "#a855f7" };
const DAY_NIGHT_LABELS = { day: "🌞 Jour", night: "🌙 Nuit", both: "🌗 Jour et nuit" };
const ZONE_RADIUS = 70; // rayon des cercles de zone, en unités de la carte (0-1000)

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

export function refreshMapModeToggle() {
  renderModeToggle(document.getElementById("map-mode-toggle"), () => {
    if (lastPal) plotPalOnMap(lastPal);
  });

  ensureLeafletMap();
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

  const overlay = L.imageOverlay(MAP_IMAGE_URL, bounds).addTo(leafletMap);
  // Si l'image configurée échoue à charger (URL externe indisponible), on
  // bascule automatiquement sur le placeholder local plutôt que de laisser
  // une carte vide.
  overlay.on("error", () => {
    if (MAP_IMAGE_URL !== FALLBACK_MAP_IMAGE_URL) {
      overlay.setUrl(FALLBACK_MAP_IMAGE_URL);
    }
  });

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

  mapStatus.innerHTML = state.viewMode === "save" ? renderCaptureStatus(palName) : "";

  const bounds = [];
  for (const spawn of spawns) {
    const { x, y } = getZoneCoordinates(spawn.zone);
    const latlng = [MAP_SIZE - y, x]; // inversion Y : notre repère -> repère Leaflet (origine en bas)
    bounds.push(latlng);

    const color = DAY_NIGHT_COLORS[spawn.day_night] || DAY_NIGHT_COLORS.both;

    // Zone colorée translucide (cercle plutôt que polygone exact, faute de
    // vraies coordonnées de contour vérifiées — voir le commentaire sur
    // ZONE_COORDINATES plus haut).
    const circle = L.circle(latlng, {
      radius: ZONE_RADIUS,
      color,
      weight: 2,
      opacity: 0.85,
      fillColor: color,
      fillOpacity: 0.25,
    });

    const popupLines = [
      `<b>${escapeHtml(spawn.zone)}</b>`,
      DAY_NIGHT_LABELS[spawn.day_night] || DAY_NIGHT_LABELS.both,
    ];
    if (spawn.level) popupLines.push(`Niveau approx. : ${escapeHtml(spawn.level)}`);
    if (spawn.note) popupLines.push(`<span style="opacity:.75">${escapeHtml(spawn.note)}</span>`);
    circle.bindPopup(popupLines.join("<br>"), { className: "palworld-dark-popup" });
    circle.addTo(markersLayer);

    // Badge de niveau au centre de la zone (ou nom de zone si pas de niveau
    // connu — on n'invente pas de chiffre quand la donnée est absente).
    const badgeText = spawn.level ? `Lv ${spawn.level}` : spawn.zone;
    const badgeIcon = L.divIcon({
      className: "",
      html: `<div class="zone-level-badge" style="border-color:${color}">${escapeHtml(badgeText)}</div>`,
      iconSize: null,
    });
    L.marker(latlng, { icon: badgeIcon, interactive: false }).addTo(markersLayer);
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
