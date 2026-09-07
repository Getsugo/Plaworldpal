import { state, idToName, SPAWN_LOCATIONS } from "./state.js";
import { renderModeToggle } from "./ui-modeToggle.js";
import { realSpawnPoints } from "./data-realSpawnPoints.js";
import { attachAutocomplete } from "./ui-autocomplete.js";

// `L` est fourni par le script Leaflet chargé via CDN dans index.html.

/**
 * Calibration monde -> pixel PORTÉE TELLE QUELLE depuis src/lib/coords.ts du
 * dépôt github.com/Nifrendil/pal-atlas (licence MIT). Ce ne sont plus des
 * positions estimées visuellement : ce sont les bornes exactes que ce projet
 * utilise lui-même pour projeter les coordonnées monde Unreal sur ses images
 * (mêmes images que les nôtres, mêmes dimensions 4096×4096).
 *
 * Les deux cartes ont un span monde parfaitement carré (vérifié :
 * palpagos 1 448 800 × 1 448 800, worldtree 341 797 × 341 797), donc une
 * seule échelle par carte suffit pour convertir aussi le rayon de spawn.
 */
const MAPS = {
  palpagos: {
    id: "palpagos",
    label: "🏝️ Îles Palpagos",
    url: "./map-palpagos.webp",
    width: 4096,
    height: 4096,
    worldMinX: -1_099_400,
    worldMaxX: 349_400,
    worldMinY: -724_400,
    worldMaxY: 724_400,
  },
  worldtree: {
    id: "worldtree",
    label: "🌳 Arbre Monde",
    url: "./map-worldtree.webp",
    width: 4096,
    height: 4096,
    worldMinX: 347_351.5,
    worldMaxX: 689_148.5,
    worldMinY: -818_197,
    worldMaxY: -476_400,
  },
};
const FALLBACK_MAP_IMAGE_URL = "./map-placeholder.svg";
const SPAWN_RADIUS_WORLD_UNITS = 15000; // constant dans spawn-zones.json (Pal Atlas)
const SPAWN_POINT_COLOR = "#a855f7"; // violet — pas de distinction jour/nuit dans cette source (voir plus bas)

/**
 * Monde Unreal (X, Y) -> point Leaflet CRS.Simple.
 * Port direct de worldToUv + uvToPixel + imageToLeaflet (coords.ts), sans les
 * marges/offsets de calibration manuelle du dépôt d'origine (inutiles ici).
 */
function worldToMapPoint(worldX, worldY, cal) {
  const spanX = cal.worldMaxX - cal.worldMinX;
  const spanY = cal.worldMaxY - cal.worldMinY;
  const u = (worldY - cal.worldMinY) / spanY;
  const v = 1 - (worldX - cal.worldMinX) / spanX;
  const pixelX = u * cal.width;
  const pixelY = v * cal.height;
  return { x: pixelX, y: cal.height - pixelY }; // image (haut-gauche) -> Leaflet (origine bas)
}

function worldRadiusToPixels(cal) {
  const spanX = cal.worldMaxX - cal.worldMinX; // == spanY (spans carrés, voir commentaire plus haut)
  return SPAWN_RADIUS_WORLD_UNITS * (cal.width / spanX);
}

let leafletMap = null;
let markersLayer = null;
let currentMapId = "palpagos";
let lastPal = "";

export function initMapTab() {
  const mapBtn = document.getElementById("map-btn");
  const mapSearch = document.getElementById("map-search");

  mapBtn.addEventListener("click", () => searchAndPlot(mapSearch.value.trim()));
  mapSearch.addEventListener("keydown", e => { if (e.key === "Enter") searchAndPlot(mapSearch.value.trim()); });

  attachAutocomplete({
    inputEl: mapSearch,
    dropdownEl: document.getElementById("map-search-dropdown"),
    getOptions: () => Object.keys(realSpawnPoints).sort(),
    onSelect: value => searchAndPlot(value),
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

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    markersLayer = null;
  }
  ensureLeafletMap();

  if (lastPal) plotPalOnMap(lastPal);
  else document.getElementById("map-status").innerHTML = "";
}

function syncMapSwitchButtonStyles() {
  document.querySelectorAll(".map-switch-btn").forEach(btn => {
    const active = btn.dataset.mapId === currentMapId;
    btn.classList.toggle("bg-amber-400", active);
    btn.classList.toggle("text-[#1a1207]", active);
    btn.classList.toggle("text-slate-300/70", !active);
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
  const entry = realSpawnPoints[palName];
  const points = (entry && entry[currentMapId]) || [];

  if (!points.length) {
    const otherMapId = currentMapId === "palpagos" ? "worldtree" : "palpagos";
    const otherPoints = (entry && entry[otherMapId]) || [];
    if (otherPoints.length) {
      mapStatus.innerHTML = `<p class="text-amber-300/90">Aucun spawn de "${escapeHtml(palName)}" sur ${cfg.label}, mais ${otherPoints.length} point(s) trouvé(s) sur ${MAPS[otherMapId].label} — basculez de carte ci-dessus.</p>`;
    } else if (entry) {
      mapStatus.innerHTML = `<p class="text-amber-300/90">Aucune donnée de spawn pour "${escapeHtml(palName)}" sur les cartes connues.</p>`;
    } else {
      mapStatus.innerHTML = `<p class="text-amber-300/90">"${escapeHtml(palName)}" introuvable dans les données de spawn (vérifiez l'orthographe exacte, ex. variantes "Noct"/"Ignis"/"Aqua"...).</p>`;
    }
    return;
  }

  let statusHtml = state.viewMode === "save" ? renderCaptureStatus(palName) : "";
  // Info complémentaire (jour/nuit, niveau approx.) quand on l'a dans notre
  // petite base curatée — cette info n'existe pas dans les données Pal Atlas
  // (voir note sur l'absence de filtre jour/nuit ci-dessous).
  const curated = SPAWN_LOCATIONS[palName];
  if (curated && curated.length) {
    statusHtml += `<div class="bg-[#121824] border border-slate-700 rounded-lg p-3 mb-2 text-xs text-slate-300/80">` +
      curated.map(s => `${escapeHtml(s.zone)} — ${dayNightLabel(s.day_night)}${s.level ? ` — Niveau approx. ${escapeHtml(s.level)}` : ""}`).join("<br>") +
      `</div>`;
  }
  statusHtml += `<p class="text-xs text-slate-400/70 mb-2">${points.length} point(s) de spawn réel(s) (source : Pal Atlas). Ce jeu de données ne distingue pas jour/nuit — tous les points sont affichés.</p>`;
  mapStatus.innerHTML = statusHtml;

  const radiusPx = worldRadiusToPixels(cfg);
  const bounds = [];

  for (const [worldX, worldY] of points) {
    const { x, y } = worldToMapPoint(worldX, worldY, cfg);
    const latlng = [y, x];
    bounds.push(latlng);

    L.circle(latlng, {
      radius: radiusPx,
      color: SPAWN_POINT_COLOR,
      weight: 1,
      opacity: 0.7,
      fillColor: SPAWN_POINT_COLOR,
      fillOpacity: 0.3,
    })
      .bindPopup(`<b>${escapeHtml(palName)}</b>`, { className: "palworld-dark-popup" })
      .addTo(markersLayer);
  }

  leafletMap.fitBounds(bounds, { padding: [40, 40] });
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
