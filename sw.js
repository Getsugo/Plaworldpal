// IMPORTANT : incrémentez CACHE_VERSION à chaque modification des fichiers
// de l'app pour forcer la mise à jour du cache chez les utilisateurs déjà
// installés (discipline anti-cache-bust — sans ça, ils resteraient bloqués
// sur une ancienne version indéfiniment).
const CACHE_VERSION = "v13";
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
  // Portraits de Pals (fournis par l'utilisateur, voir ui-collectionTab.js)
  "./pal-icon-anubis.webp",
  "./pal-icon-arsox.webp",
  "./pal-icon-astegon.webp",
  "./pal-icon-azurobe.webp",
  "./pal-icon-beakon.webp",
  "./pal-icon-beegarde.webp",
  "./pal-icon-blazamut.webp",
  "./pal-icon-blazehowl-noct.webp",
  "./pal-icon-blazehowl.webp",
  "./pal-icon-bristla.webp",
  "./pal-icon-broncherry-aqua.webp",
  "./pal-icon-broncherry.webp",
  "./pal-icon-bushi.webp",
  "./pal-icon-caprity.webp",
  "./pal-icon-cattiva.webp",
  "./pal-icon-cawgnito.webp",
  "./pal-icon-celaray.webp",
  "./pal-icon-chikipi.webp",
  "./pal-icon-chillet.webp",
  "./pal-icon-cinnamoth.webp",
  "./pal-icon-cremis.webp",
  "./pal-icon-cryolinx.webp",
  "./pal-icon-daedream.webp",
  "./pal-icon-dazzi.webp",
  "./pal-icon-depresso.webp",
  "./pal-icon-digtoise.webp",
  "./pal-icon-dinossom-lux.webp",
  "./pal-icon-dinossom.webp",
  "./pal-icon-direhowl.webp",
  "./pal-icon-dumud.webp",
  "./pal-icon-eikthyrdeer-terra.webp",
  "./pal-icon-eikthyrdeer.webp",
  "./pal-icon-elizabee.webp",
  "./pal-icon-elphidran-aqua.webp",
  "./pal-icon-elphidran.webp",
  "./pal-icon-faleris.webp",
  "./pal-icon-felbat.webp",
  "./pal-icon-fenglope.webp",
  "./pal-icon-flambelle.webp",
  "./pal-icon-flopie.webp",
  "./pal-icon-foxcicle.webp",
  "./pal-icon-foxparks.webp",
  "./pal-icon-frostallion.webp",
  "./pal-icon-fuack.webp",
  "./pal-icon-fuddler.webp",
  "./pal-icon-galeclaw.webp",
  "./pal-icon-gobfin-ignis.webp",
  "./pal-icon-gobfin.webp",
  "./pal-icon-gorirat.webp",
  "./pal-icon-grintale.webp",
  "./pal-icon-grizzbolt.webp",
  "./pal-icon-gumoss.webp",
  "./pal-icon-hangyu-cryst.webp",
  "./pal-icon-hangyu.webp",
  "./pal-icon-helzephyr.webp",
  "./pal-icon-hoocrates.webp",
  "./pal-icon-incineram-noct.webp",
  "./pal-icon-incineram.webp",
  "./pal-icon-jetragon.webp",
  "./pal-icon-jolthog-cryst.webp",
  "./pal-icon-jolthog.webp",
  "./pal-icon-jormuntide-ignis.webp",
  "./pal-icon-jormuntide.webp",
  "./pal-icon-katress.webp",
  "./pal-icon-kelpsea-ignis.webp",
  "./pal-icon-kelpsea.webp",
  "./pal-icon-killamari.webp",
  "./pal-icon-kingpaca.webp",
  "./pal-icon-kitsun.webp",
  "./pal-icon-lamball.webp",
  "./pal-icon-leezpunk-ignis.webp",
  "./pal-icon-leezpunk.webp",
  "./pal-icon-lifmunk.webp",
  "./pal-icon-loupmoon.webp",
  "./pal-icon-lovander.webp",
  "./pal-icon-lunaris.webp",
  "./pal-icon-lyleen-noct.webp",
  "./pal-icon-lyleen.webp",
  "./pal-icon-mammorest-cryst.webp",
  "./pal-icon-mammorest.webp",
  "./pal-icon-maraith.webp",
  "./pal-icon-mau.webp",
  "./pal-icon-melpaca.webp",
  "./pal-icon-menasting.webp",
  "./pal-icon-mossanda-lux.webp",
  "./pal-icon-mossanda.webp",
  "./pal-icon-mozzarina.webp",
  "./pal-icon-nitewing.webp",
  "./pal-icon-nox.webp",
  "./pal-icon-orserk.webp",
  "./pal-icon-pengullet.webp",
  "./pal-icon-penking.webp",
  "./pal-icon-petallia.webp",
  "./pal-icon-pyrin-noct.webp",
  "./pal-icon-pyrin.webp",
  "./pal-icon-quivern.webp",
  "./pal-icon-ragnahawk.webp",
  "./pal-icon-rayhound.webp",
  "./pal-icon-reindrix.webp",
  "./pal-icon-relaxaurus-lux.webp",
  "./pal-icon-relaxaurus.webp",
  "./pal-icon-reptyro-cryst.webp",
  "./pal-icon-reptyro.webp",
  "./pal-icon-ribbuny.webp",
  "./pal-icon-robinquill-terra.webp",
  "./pal-icon-robinquill.webp",
  "./pal-icon-rooby.webp",
  "./pal-icon-rushoar.webp",
  "./pal-icon-shadowbeak.webp",
  "./pal-icon-sibelyx.webp",
  "./pal-icon-sparkit.webp",
  "./pal-icon-surfent-terra.webp",
  "./pal-icon-surfent.webp",
  "./pal-icon-suzaku-aqua.webp",
  "./pal-icon-suzaku.webp",
  "./pal-icon-swee.webp",
  "./pal-icon-sweepa.webp",
  "./pal-icon-tanzee.webp",
  "./pal-icon-teafant.webp",
  "./pal-icon-tocotoco.webp",
  "./pal-icon-tombat.webp",
  "./pal-icon-univolt.webp",
  "./pal-icon-vaelet.webp",
  "./pal-icon-vanwyrm-cryst.webp",
  "./pal-icon-vanwyrm.webp",
  "./pal-icon-verdash.webp",
  "./pal-icon-vixy.webp",
  "./pal-icon-warsect.webp",
  "./pal-icon-wixen.webp",
  "./pal-icon-woolipop.webp",
  "./pal-icon-wumpo-botan.webp",
  "./pal-icon-wumpo.webp",
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
  "./ui-autocomplete.js",
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
