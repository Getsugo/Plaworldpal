/**
 * Même règle que documentée par la communauté (palworld.wiki.gg/wiki/Breeding) :
 * moyenne des "rangs" d'élevage des deux parents -> Pal le plus proche,
 * sauf combo spécial qui prime toujours sur la formule.
 */
export class BreedingCalculator {
  constructor(palsDatabase, specialCombos) {
    this.rankByName = {};
    this.knownNames = new Set(); // tous les noms de la base, même sans rang connu

    for (const p of palsDatabase.pals) {
      this.knownNames.add(p.name);
      // On n'ajoute à rankByName QUE les Pals avec un rang d'élevage réellement
      // connu (breeding_rank non null). Un Pal identifié (nom + CharacterID)
      // mais sans rang vérifié ne doit jamais entrer dans le calcul par
      // moyenne — ça produirait des combinaisons silencieusement fausses.
      if (p.breeding_rank !== null && p.breeding_rank !== undefined) {
        this.rankByName[p.name] = p.breeding_rank;
      }
    }
    this.sortedRanks = Object.entries(this.rankByName).sort((a, b) => a[1] - b[1]);

    this.specialComboChild = new Map();
    for (const combo of specialCombos.combos) {
      this.specialComboChild.set(this._pairKey(combo.parent_a, combo.parent_b), combo.child);
    }
  }

  /** Le Pal existe dans la base (nom + CharacterID connus), rang ou non. */
  isKnownPal(name) {
    return this.knownNames.has(name);
  }

  /** Le Pal a un rang d'élevage vérifié, utilisable dans les calculs. */
  hasKnownRank(name) {
    return this.rankByName[name] !== undefined;
  }

  _pairKey(a, b) {
    return [a, b].sort().join("::");
  }

  predictChild(parentA, parentB) {
    const key = this._pairKey(parentA, parentB);
    if (this.specialComboChild.has(key)) return this.specialComboChild.get(key);

    const rankA = this.rankByName[parentA];
    const rankB = this.rankByName[parentB];
    if (rankA === undefined || rankB === undefined) return null;

    const targetRank = Math.round((rankA + rankB) / 2);
    let bestName = null;
    let bestDiff = Infinity;
    for (const [name, rank] of this.sortedRanks) {
      const diff = Math.abs(rank - targetRank);
      if (diff < bestDiff) {
        bestName = name;
        bestDiff = diff;
      }
    }
    return bestName;
  }

  findCombosForTarget(targetName, ownedPals, idToName) {
    const bySpecies = {};
    for (const pal of ownedPals) {
      const name = idToName[pal.species_id];
      if (!name) continue;
      if (!bySpecies[name]) bySpecies[name] = { Male: 0, Female: 0 };
      if (pal.gender === "Male" || pal.gender === "Female") {
        bySpecies[name][pal.gender] += 1;
      }
    }

    const species = Object.keys(bySpecies);
    const results = [];

    for (let i = 0; i < species.length; i++) {
      for (let j = i; j < species.length; j++) {
        const speciesA = species[i];
        const speciesB = species[j];
        const predicted = this.predictChild(speciesA, speciesB);
        if (predicted !== targetName) continue;

        const isSpecial = this.specialComboChild.has(this._pairKey(speciesA, speciesB));
        const countsA = bySpecies[speciesA];
        const countsB = bySpecies[speciesB];

        if (speciesA === speciesB) {
          if (countsA.Male > 0 && countsA.Female > 0) {
            results.push({
              parent_a: speciesA, parent_a_gender: "Male",
              parent_b: speciesB, parent_b_gender: "Female",
              special_combo: isSpecial,
              owned_count_a: countsA.Male, owned_count_b: countsB.Female,
            });
          }
          continue;
        }

        if (countsA.Male > 0 && countsB.Female > 0) {
          results.push({
            parent_a: speciesA, parent_a_gender: "Male",
            parent_b: speciesB, parent_b_gender: "Female",
            special_combo: isSpecial,
            owned_count_a: countsA.Male, owned_count_b: countsB.Female,
          });
        }
        if (countsA.Female > 0 && countsB.Male > 0) {
          results.push({
            parent_a: speciesB, parent_a_gender: "Male",
            parent_b: speciesA, parent_b_gender: "Female",
            special_combo: isSpecial,
            owned_count_a: countsB.Male, owned_count_b: countsA.Female,
          });
        }
      }
    }

    return results;
  }

  /**
   * Mode "Global" : toutes les paires théoriquement possibles parmi TOUS
   * les Pals connus de la base de données (pas seulement ceux possédés).
   * Utile pour explorer les combinaisons sans avoir chargé de sauvegarde.
   * Ne renvoie pas de comptage (on ne sait pas ce que le joueur possède).
   */
  findAllPossibleCombos(targetName) {
    const species = this.sortedRanks.map(([name]) => name);
    const results = [];

    for (let i = 0; i < species.length; i++) {
      for (let j = i; j < species.length; j++) {
        const speciesA = species[i];
        const speciesB = species[j];
        const predicted = this.predictChild(speciesA, speciesB);
        if (predicted !== targetName) continue;

        results.push({
          parent_a: speciesA,
          parent_b: speciesB,
          special_combo: this.specialComboChild.has(this._pairKey(speciesA, speciesB)),
          same_species: speciesA === speciesB,
        });
      }
    }
    return results;
  }
}
