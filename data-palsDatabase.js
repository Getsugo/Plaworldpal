// Généré à partir de palsDatabase.json — éditez directement cet objet JS.
export const palsDatabase = {
  "_meta": {
    "description": "Base de données de départ (sous-ensemble). Le champ 'internal_ids' correspond au CharacterID utilisé dans les fichiers de sauvegarde Palworld (visible en inspectant votre Level.sav converti en JSON via palworld-save-tools). Le champ 'breeding_rank' est le 'pouvoir d'élevage' officieux (10 = le plus fort/rare, 1500 = le plus faible) tel que documenté par la communauté (palworld.wiki.gg). Ces valeurs peuvent évoluer avec les mises à jour du jeu : vérifiez-les si un résultat vous semble faux, et complétez ce fichier avec 'tools/import_paldex_data.py'.",
    "breeding_formula": "rang_enfant = round((rang_parent1 + rang_parent2) / 2), puis on prend le Pal dont le breeding_rank est le plus proche de ce nombre (en excluant les combinaisons spéciales listées dans special_combos.json qui priment toujours sur la formule)."
  },
  "pals": [
    {
      "internal_ids": [
        "SheepBall"
      ],
      "name": "Lamball",
      "types": [
        "neutral"
      ],
      "breeding_rank": 880
    },
    {
      "internal_ids": [
        "Chikipi"
      ],
      "name": "Chikipi",
      "types": [
        "neutral"
      ],
      "breeding_rank": 1000
    },
    {
      "internal_ids": [
        "CatWolf"
      ],
      "name": "Cattiva",
      "types": [
        "neutral"
      ],
      "breeding_rank": 890
    },
    {
      "internal_ids": [
        "StrawberryMouse"
      ],
      "name": "Teafant",
      "types": [
        "water"
      ],
      "breeding_rank": 940
    },
    {
      "internal_ids": [
        "CoolPeacock"
      ],
      "name": "Vixy",
      "types": [
        "neutral"
      ],
      "breeding_rank": 870
    },
    {
      "internal_ids": [
        "PinkCat"
      ],
      "name": "Fuack",
      "types": [
        "water"
      ],
      "breeding_rank": 690
    },
    {
      "internal_ids": [
        "RedFox"
      ],
      "name": "Foxparks",
      "types": [
        "fire"
      ],
      "breeding_rank": 620
    },
    {
      "internal_ids": [
        "FanCat"
      ],
      "name": "Fuddler",
      "types": [
        "neutral"
      ],
      "breeding_rank": 640
    },
    {
      "internal_ids": [
        "ForestFox"
      ],
      "name": "Gumoss",
      "types": [
        "grass"
      ],
      "breeding_rank": 850
    },
    {
      "internal_ids": [
        "Robinquill"
      ],
      "name": "Robinquill",
      "types": [
        "grass"
      ],
      "breeding_rank": 590
    },
    {
      "internal_ids": [
        "CryoWolf"
      ],
      "name": "Jolthog",
      "types": [
        "electric"
      ],
      "breeding_rank": 610
    },
    {
      "internal_ids": [
        "IceRabbit"
      ],
      "name": "Pengullet",
      "types": [
        "water",
        "ice"
      ],
      "breeding_rank": 780
    },
    {
      "internal_ids": [
        "SheepClone"
      ],
      "name": "Mau",
      "types": [
        "dark"
      ],
      "breeding_rank": 700
    },
    {
      "internal_ids": [
        "Sparkit"
      ],
      "name": "Sparkit",
      "types": [
        "electric"
      ],
      "breeding_rank": 660
    },
    {
      "internal_ids": [
        "FireKid"
      ],
      "name": "Rooby",
      "types": [
        "fire"
      ],
      "breeding_rank": 560
    },
    {
      "internal_ids": [
        "RockGolem"
      ],
      "name": "Gobfin",
      "types": [
        "water"
      ],
      "breeding_rank": 600
    },
    {
      "internal_ids": [
        "BoarBell"
      ],
      "name": "Rushoar",
      "types": [
        "neutral"
      ],
      "breeding_rank": 650
    },
    {
      "internal_ids": [
        "Dodo"
      ],
      "name": "Nox",
      "types": [
        "dark"
      ],
      "breeding_rank": 590
    },
    {
      "internal_ids": [
        "BlueOwl"
      ],
      "name": "Vanwyrm",
      "types": [
        "fire",
        "dark"
      ],
      "breeding_rank": 280
    },
    {
      "internal_ids": [
        "FlowerDoll"
      ],
      "name": "Lifmunk",
      "types": [
        "grass"
      ],
      "breeding_rank": 700
    },
    {
      "internal_ids": [
        "FlowerRabbit"
      ],
      "name": "Flambelle",
      "types": [
        "fire"
      ],
      "breeding_rank": 560
    },
    {
      "internal_ids": [
        "SwanFish"
      ],
      "name": "Elizabee",
      "types": [
        "grass"
      ],
      "breeding_rank": 460
    },
    {
      "internal_ids": [
        "ElecPanda"
      ],
      "name": "Elecpanda",
      "types": [
        "electric"
      ],
      "breeding_rank": 420
    },
    {
      "internal_ids": [
        "PandaFire"
      ],
      "name": "Pandamoniac",
      "types": [
        "fire"
      ],
      "breeding_rank": 380
    },
    {
      "internal_ids": [
        "BluePlatypus"
      ],
      "name": "Surfent",
      "types": [
        "water"
      ],
      "breeding_rank": 340
    },
    {
      "internal_ids": [
        "CatEmperor"
      ],
      "name": "Mossanda",
      "types": [
        "grass"
      ],
      "breeding_rank": 300
    },
    {
      "internal_ids": [
        "SkyDragon"
      ],
      "name": "Jetragon",
      "types": [
        "dragon"
      ],
      "breeding_rank": 10
    },
    {
      "internal_ids": [
        "LazyDragon"
      ],
      "name": "Relaxaurus",
      "types": [
        "dragon",
        "water"
      ],
      "breeding_rank": 280
    },
    {
      "internal_ids": [
        "FirePanda"
      ],
      "name": "Arsox",
      "types": [
        "fire"
      ],
      "breeding_rank": 550
    },
    {
      "internal_ids": [
        "IceHorse"
      ],
      "name": "Reindrix",
      "types": [
        "ice"
      ],
      "breeding_rank": 420
    },
    {
      "internal_ids": [
        "Warmonger"
      ],
      "name": "Anubis",
      "types": [
        "ground"
      ],
      "breeding_rank": 220
    },
    {
      "internal_ids": [
        "PenguinPeople"
      ],
      "name": "Penking",
      "types": [
        "water",
        "ice"
      ],
      "breeding_rank": 320
    },
    {
      "internal_ids": [
        "MoscoBoss"
      ],
      "name": "Bushi",
      "types": [
        "fire"
      ],
      "breeding_rank": 500
    },
    {
      "internal_ids": [
        "BirdDragon"
      ],
      "name": "Faleris",
      "types": [
        "fire",
        "dragon"
      ],
      "breeding_rank": 150
    },
    {
      "internal_ids": [
        "IceDeer"
      ],
      "name": "Eikthyrdeer",
      "types": [
        "ice"
      ],
      "breeding_rank": 700
    },
    {
      "internal_ids": [
        "ElecKitsune"
      ],
      "name": "Kitsun",
      "types": [
        "fire"
      ],
      "breeding_rank": 260
    },
    {
      "internal_ids": [
        "LazyDragonBlack"
      ],
      "name": "Astegon",
      "types": [
        "dragon",
        "dark"
      ],
      "breeding_rank": 90
    },
    {
      "internal_ids": [
        "ThunderDragonRideBird"
      ],
      "name": "Suzaku",
      "types": [
        "fire"
      ],
      "breeding_rank": 130
    },
    {
      "internal_ids": [
        "ThunderDeer"
      ],
      "name": "Grizzbolt",
      "types": [
        "electric"
      ],
      "breeding_rank": 200
    },
    {
      "internal_ids": [
        "BlackWaterSnake"
      ],
      "name": "Jormuntide",
      "types": [
        "dragon",
        "water"
      ],
      "breeding_rank": 170
    },
    {
      "internal_ids": [
        "NightLady"
      ],
      "name": "Lyleen",
      "types": [
        "grass"
      ],
      "breeding_rank": 260
    },
    {
      "internal_ids": [
        "SnowMonkey"
      ],
      "name": "Frostallion",
      "types": [
        "ice"
      ],
      "breeding_rank": 20
    },
    {
      "internal_ids": [
        "RabbitEmperor"
      ],
      "name": "Shadowbeak",
      "types": [
        "dark",
        "dragon"
      ],
      "breeding_rank": 100
    },
    {
      "internal_ids": [
        "CrystalDeer"
      ],
      "name": "Helzephyr",
      "types": [
        "dark"
      ],
      "breeding_rank": 180
    },
    {
      "internal_ids": [
        "CrystalMonkey"
      ],
      "name": "Cryolinx",
      "types": [
        "ice"
      ],
      "breeding_rank": 40
    },
    {
      "internal_ids": [
        "SharkKid"
      ],
      "name": "Katress",
      "types": [
        "dark"
      ],
      "breeding_rank": 480
    },
    {
      "internal_ids": [
        "IceMonster"
      ],
      "name": "Wumpo",
      "types": [
        "ice"
      ],
      "breeding_rank": 360
    }
  ]
};
