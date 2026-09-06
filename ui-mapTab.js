import { state, idToName, SPAWN_LOCATIONS } from "./state.js";
import { renderModeToggle } from "./ui-modeToggle.js";

// `L` est fourni par le script Leaflet chargé via CDN dans index.html.

/**
 * ⚠️ Note sur les chemins d'image : la demande initiale utilisait
 * "./assets/map.webp" / "./assets/worldtree.webp" (sous-dossier "assets/").
 * Ce projet est volontairement 100% à plat (aucun sous-dossier, décision
 * prise plus tôt pour faciliter l'upload/édition depuis un téléphone) — les
 * deux images sont donc attendues directement à la racine, sous les noms
 * ci-dessous. Si vous préférez un sous-dossier "assets/", changez juste les
 * deux URLs dans MAPS.
 */
const MAPS = {
  palpagos: {
    id: "palpagos",
    label: "🏝️ Îles Palpagos",
    url: "./map-palpagos.webp",
    width: 4096,
    height: 4096,
    hasZoneData: true,
  },
  worldtree: {
    id: "worldtree",
    label: "🌳 Arbre Monde",
    url: "./map-worldtree.webp",
    width: 4096,
    height: 4096,
    hasZoneData: false, // voir commentaire plus bas : aucune donnée de zone pour cette carte pour l'instant
  },
};
const FALLBACK_MAP_IMAGE_URL = "./map-placeholder.svg";

/**
 * ⚠️ Calibration des zones sur la VRAIE image Palpagos — état honnête :
 * en regardant l'image que vous avez fournie, j'ai pu repérer avec une
 * confiance raisonnable quelques masses continentales par leur couleur
 * (neige = blanc, lave = rouge/noir, grande zone verte = prairie/forêt).
 * Les autres restent des positions approximatives non calibrées (marquées
 * ci-dessous). Coordonnées en repère NORMALISÉ 0-1000 (indépendant de la
 * résolution réelle de l'image, remises à l'échelle au moment de l'affichage
 * — voir getScaledZoneCoordinates). Ajustez directement les valeurs ici si
 * elles ne correspondent pas à ce que vous voyez en jeu.
 */
const ZONE_COORDINATES = {
  "Windswept Hills": { x: 600, y: 500 }, // repéré visuellement : grande masse verte centrale
  "Verdant Brook": { x: 500, y: 480 }, // repéré visuellement : partie ouest de la masse verte centrale
  "Iceberg Wasteland": { x: 560, y: 190 }, // repéré visuellement : masse blanche/neige en haut
  "Mount Obsidian": { x: 370, y: 550 }, // repéré visuellement : île sombre avec marques rouges (lave)
  "Deep Sand Dunes": { x: 780, y: 220 }, // NON CALIBRÉ — position approximative à vérifier
  "Astral Mountains": { x: 700, y: 300 }, // NON CALIBRÉ — position approximative à vérifier
  "Volcanic Island": { x: 900, y: 600 }, // NON CALIBRÉ — position approximative à vérifier
};

function getZoneCoordinatesNormalized(zoneName) {
  if (ZONE_COORDINATES[zoneName]) return ZONE_COORDINATES[zoneName];

  for (const [baseName, coords] of Object.entries(ZONE_COORDINATES)) {
    if (zoneName.includes(baseName)) {
      const jitter = hashJitter(zoneName);
      return { x: coords.x + jitter.dx, y: coords.y + jitter.dy };
    }
  }
  if (zoneName.includes("Sea Breeze")) return { x: 300, y: 850 }; // NON CALIBRÉ

  const jitter = hashJitter(zoneName);
  return { x: 500 + jitter.dx * 4, y: 500 + jitter.dy * 4 };
}

/** Remet à l'échelle les coordonnées normalisées (0-1000) sur les vraies dimensions de la carte active. */
function getScaledZoneCoordinates(zoneName, mapCfg) {
  const norm = getZoneCoordinatesNormalized(zoneName);
  return { x: (norm.x / 1000) * mapCfg.width, y: (norm.y / 1000) * mapCfg.height };
}

function hashJitter(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return { dx: (hash % 61) - 30, dy: ((hash >> 8) % 61) - 30 };
}

const DAY_NIGHT_COLORS = { day: "#f97316", night: "#3b82f6", both: "#a855f7" };
const DAY_NIGHT_LABELS = { day: "🌞 Jour", night: "🌙 Nuit", both: "🌗 Jour et nuit" };
const ZONE_RADIUS_NORMALIZED = 70; // rayon en unités normalisées (0-1000), remis à l'échelle comme les coordonnées

let leafletMap = null;
let markersLayer = null;
let dayNightFilter = "both";
let currentMapId = "palpagos";
let lastPal = "";

export function initMapTab() {
  const mapBtn = document.getElementById("map-btn");
  const mapSearch = document.getElementById("map-search");

  mapBtn.addEventListener("click", () => searchAndPlot(mapSearch.value.trim()));
  mapSearch.addEventListener("keydown", e => { if (e.key === "Enter") searchAndPlot(mapSearch.value.trim()); });

  document.querySelectorAll(".daynight-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      dayNightFilter = btn.dataset.filter;
      syncFilterButtonStyles();
      if (lastPal) plotPalOnMap(lastPal);
    });
  });

  document.querySelectorAll(".map-switch-btn").forEach(btn => {
    btn.addEventListener("click", () => switchMap(btn.dataset.mapId));
  });
  syncMapSwitchButtonStyles();

  refreshMapModeToggle();
}

export function refreshMapModeToggle() {
  renderModeToggle(document.getElementById("map-mode-toggle"), () => {
    if (lastPal) plotPalOnMap(lastPal);
  });

  ensureLeafletMap();
  if (leafletMap) leafletMap.invalidateSize();
}

function switchMap(mapId) {
  if (!MAPS[mapId] || mapId === currentMapId) return;
  currentMapId = mapId;
  syncMapSwitchButtonStyles();

  // On reconstruit la carte Leaflet à neuf : plus simple et plus fiable que
  // de tenter de faire muter les bounds/CRS d'une instance déjà vivante,
  // surtout si les deux cartes ont des dimensions différentes.
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    markersLayer = null;
  }
  ensureLeafletMap();

  if (lastPal) {
    plotPalOnMap(lastPal);
  } else if (!MAPS[currentMapId].hasZoneData) {
    document.getElementById("map-status").innerHTML =
      `<p class="text-slate-400/80 text-sm">Pas encore de données de zones pour "${MAPS[currentMapId].label}".</p>`;
  } else {
    document.getElementById("map-status").innerHTML = "";
  }
}

function syncMapSwitchButtonStyles() {
  document.querySelectorAll(".map-switch-btn").forEach(btn => {
    const active = btn.dataset.mapId === currentMapId;
    btn.classList.toggle("bg-amber-400", active);
    btn.classList.toggle("text-[#1a1207]", active);
    btn.classList.toggle("text-slate-300/70", !active);
  });
}

function syncFilterButtonStyles() {
  document.querySelectorAll(".daynight-filter-btn").forEach(b => {
    const active = b.dataset.filter === dayNightFilter;
    b.classList.toggle("bg-amber-400", active);
    b.classList.toggle("text-[#1a1207]", active);
    b.classList.toggle("text-slate-300/70", !active);
  });
}

function ensureLeafletMap() {
  if (leafletMap || typeof L === "undefined") return;

  const cfg = MAPS[currentMapId];
  const bounds = [[0, 0], [cfg.height, cfg.width]];
  leafletMap = L.map("leaflet-map-container", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 3,
    zoomSnap: 0.25,
    attributionControl: false,
  });

  const overlay = L.imageOverlay(cfg.url, bounds).addTo(leafletMap);
  overlay.on("error", () => {
    if (cfg.url !== FALLBACK_MAP_IMAGE_URL) overlay.setUrl(FALLBACK_MAP_IMAGE_URL);
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
  const cfg = MAPS[currentMapId];

  if (!cfg.hasZoneData) {
    mapStatus.innerHTML = `<p class="text-slate-400/80 text-sm">Pas encore de données de zones pour "${cfg.label}" — basculez sur "Îles Palpagos" pour voir les zones connues de ${escapeHtml(palName)}.</p>`;
    return;
  }

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
  const radiusPx = (ZONE_RADIUS_NORMALIZED / 1000) * cfg.width;

  for (const spawn of spawns) {
    const { x, y } = getScaledZoneCoordinates(spawn.zone, cfg);
    const latlng = [cfg.height - y, x]; // inversion Y : repère image -> repère Leaflet (origine en bas)
    bounds.push(latlng);

    const color = DAY_NIGHT_COLORS[spawn.day_night] || DAY_NIGHT_COLORS.both;

    const circle = L.circle(latlng, {
      radius: radiusPx,
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
