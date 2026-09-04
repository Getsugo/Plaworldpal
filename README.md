# Assistant Élevage Palworld — 100% statique, structure à plat

Aucune commande `npm`, aucune étape de build, **aucun sous-dossier** (à part
GitHub qui gère ses propres fichiers `.git`) — tous les fichiers sont
directement à la racine du dépôt. C'est fait exprès pour être facile à
uploader et modifier depuis le site GitHub, y compris sur téléphone.

Fonctionne :
- en ouvrant `index.html` directement dans un navigateur (double-clic) ;
- ou hébergé sur GitHub Pages, **Source : "Deploy from a branch" → `main`**.

---

## ⚠️ À lire en premier — fiabilité du parsing binaire

Le format `.sav` de Palworld n'est pas documenté officiellement.
`gvas-binaryReader.js` et `gvas-gvasParser.js` (système générique de
propriétés Unreal Engine) sont fiables — format stable et bien documenté
par la communauté. En revanche `gvas-palworldCustomReaders.js` (décodage de
la structure spécifique d'un Pal — espèce, sexe, passifs) est la zone la
plus incertaine et **n'a pas pu être testée contre un vrai fichier** dans
l'environnement où ce code a été généré (pas d'accès réseau, pas de fichier
réel disponible).

**Si l'import échoue ou renvoie 0 Pal** : cliquez sur "Afficher les logs de
parsing" dans l'onglet Import, copiez-les-moi — c'est un seul fichier isolé
(`gvas-palworldCustomReaders.js`) que je peux corriger sans toucher au reste.

---

## Tous les fichiers, à la racine

```
index.html                       # Structure + Tailwind CDN
manifest.json                    # PWA installable
sw.js                            # Service worker (cache hors-ligne)
icon.svg                         # Icône de l'app

app.js                           # Orchestration, onglets, drag & drop
state.js                         # État partagé + localStorage
saveParser.js                    # Orchestrateur haut niveau du parsing
breedingCalculator.js            # Algorithme d'élevage

gvas-decompress.js               # Header 12 octets + zlib (fflate via CDN)
gvas-binaryReader.js             # Lecteur binaire bas niveau
gvas-gvasParser.js               # Système de propriétés générique UE
gvas-palworldCustomReaders.js    # Décodage RawData (zone à risque, voir ci-dessus)

data-palsDatabase.js             # Pals + breeding_rank + internal_ids
data-specialCombos.js            # Combos spéciaux (hors formule)
data-spawnLocations.js           # Zones de capture connues

ui-collectionTab.js              # Rendu de l'onglet Collection
ui-breedingTab.js                # Rendu de l'onglet Élevage
ui-mapTab.js                     # Rendu de l'onglet Carte
```

Le préfixe (`gvas-`, `data-`, `ui-`) remplace ce qui aurait été des
sous-dossiers — pure convention de nommage, sans incidence sur le
fonctionnement. Vous pouvez tout renommer tant que vous mettez à jour les
lignes `import ... from "./nom-du-fichier.js"` correspondantes.

Deux dépendances externes, chargées depuis un CDN (pas de `node_modules`) :
- **Tailwind CSS** via `<script src="https://cdn.tailwindcss.com">` dans `index.html`.
- **fflate** (décompression zlib) via `import ... from "https://esm.sh/fflate@0.8.2"` dans `gvas-decompress.js`.

---

## Pourquoi les données sont en `.js` et pas en `.json`

Pour que l'app fonctionne même en ouvrant `index.html` en double-clic
(protocole `file://`) : les navigateurs bloquent `fetch()` sur des fichiers
locaux par sécurité, mais autorisent les imports de modules ES
(`import ... from "./data-xxx.js"`). Les bases de données
(`data-palsDatabase.js`, etc.) sont donc de simples fichiers JS qui
exportent un objet — contenu strictement identique à du JSON, juste
encadré par `export const xxx = { ... };`.

**Pour les modifier depuis un téléphone** : ouvrez le fichier sur
github.com (crayon d'édition), modifiez l'objet comme n'importe quel JSON,
sans toucher à la première ligne (`export const xxx = `) ni au `;` final.

---

## Déploiement sur GitHub Pages

1. Créez un dépôt sur github.com, **sans** cocher "Add a README" (pour
   éviter un conflit de fichier).
2. Sur la page du dépôt vide, cliquez sur **"uploading an existing file"**.
3. Uploadez **tous les fichiers** de ce dossier **en une fois** (sélection
   multiple) — comme il n'y a aucun sous-dossier, un simple glisser-déposer
   ou une sélection multiple depuis votre appli de fichiers suffit, même
   sur mobile.
4. Vérifiez que `index.html` apparaît bien **directement** à la racine du
   dépôt : l'URL doit être `github.com/<vous>/<repo>/blob/main/index.html`,
   pas `.../blob/main/un-dossier/index.html`.
5. **Settings → Pages → Source : "Deploy from a branch"**, branche `main`,
   dossier `/ (root)`.
6. L'app est disponible après quelques minutes à
   `https://<vous>.github.io/<repo>/`.

### Modifier et republier depuis un téléphone

1. Sur github.com, ouvrez le fichier à modifier, icône crayon en haut à
   droite, éditez, "Commit changes".
2. GitHub Pages redéploie automatiquement en 1-2 minutes.
3. Aucune commande, aucun terminal.

---

## Test en local avant de pousser

Ouvrir `index.html` en double-clic fonctionne pour l'essentiel, **sauf** :
- le service worker (`sw.js`), qui nécessite `https://` ou
  `http://localhost` pour s'enregistrer — sans lui, l'app fonctionne
  normalement, juste sans mode hors-ligne ;
- l'import CDN de `fflate` nécessite une connexion internet (comme Tailwind).

Pour un test 100% fidèle à la production (avec service worker), depuis un
ordinateur :

```bash
python -m http.server 8080
# puis ouvrez http://localhost:8080
```

---

## ⚠️ Fiabilité des données de gameplay (indépendant du parsing binaire)

- `data-palsDatabase.js` (~45 Pals avec `internal_ids` et `breeding_rank`)
  est un point de départ compilé de sources communautaires, **non vérifié
  Pal par Pal**. Si un Pal n'est pas reconnu, l'onglet Collection l'indique :
  ajoutez son `CharacterID` exact au fichier.
- `data-spawnLocations.js` ne couvre que quelques Pals à titre d'exemple.
- La formule d'élevage (moyenne des rangs + combos spéciaux prioritaires)
  suit la documentation communautaire, pas des valeurs officielles
  publiées par le studio.

---

## Utilisation

1. **Import** : glissez-déposez votre `Level.sav` (ou touchez la zone sur
   mobile). En cas d'échec, consultez les logs de debug.
2. **Collection** : vérifie la reconnaissance de vos Pals, sélection du
   joueur si sauvegarde multijoueur.
3. **Élevage** : recherchez un Pal cible, obtenez les paires de parents
   (espèce + sexe requis) possibles avec votre collection actuelle.
4. **Carte** : zones de capture connues en alternative à l'élevage.

Toutes les données restent dans le `localStorage` de votre navigateur.
