// IMPORTANT : incrémentez CACHE_VERSION à chaque modification des fichiers
// de l'app pour forcer la mise à jour du cache chez les utilisateurs déjà
// installés (discipline anti-cache-bust — sans ça, ils resteraient bloqués
// sur une ancienne version indéfiniment).
const CACHE_VERSION = "v7";
const CACHE_NAME = `palworld-breeding-${CACHE_VERSION}`;

// Chemins relatifs à la racine du service worker (fonctionne aussi bien à
// la racine d'un domaine qu'en sous-dossier GitHub Pages, ex: /mon-repo/).
// Tout est à plat, aucun sous-dossier.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./map-placeholder.svg",
  "./map-palpagos.webp",
  "./map-worldtree.webp",
  "./app.js",
  "./state.js",
  "./saveParser.js",
  "./breedingCalculator.js",
  "./gvas-binaryReader.js",
  "./gvas-decompress.js",
  "./gvas-gvasParser.js",
  "./gvas-palworldCustomReaders.js",
  "./data-palsDatabase.js",
  "./data-specialCombos.js",
  "./data-spawnLocations.js",
  "./data-realSpawnPoints.js",
  "./ui-collectionTab.js",
  "./ui-breedingTab.js",
  "./ui-mapTab.js",
  "./ui-modeToggle.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll échouerait entièrement si UNE seule ressource externe (CDN)
      // est temporairement indisponible ; on met donc en cache l'app shell
      // local requête par requête, en ignorant les échecs individuels.
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn(`[SW] Échec cache: ${url}`, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // On ne met en cache que les requêtes GET (les CDN externes comme
  // Tailwind/fflate/Google Fonts passent aussi par ce chemin générique).
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
