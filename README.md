# Tablettes murales (`home-desk`)

L'application dédiée qui tourne sur les trois tablettes Fire 7 de la maison —
salon, bureau, cuisine. TypeScript + `lit`, construite par rollup, servie par
Home Assistant depuis `config/www/wallpanel/`.

## ⚠️ Ce package est propre à UNE maison

Ce n'est pas une base paramétrable, et ce n'est pas un oubli.

- `app/src/` cite **66 `entity_id` en dur**, répartis en 18 domaines.
- `app/src/ecran.ts` déclare `PIECES: Record<'salon' | 'bureau' | 'cuisine', Piece>` —
  les trois pièces sont un **type TypeScript**, pas une donnée de configuration.

Installé ailleurs, il affiche un écran d'entités inexistantes. La
paramétrisation coûterait une refonte de `pieces.ts`, `modes.ts` et des 41
fichiers de tests, pour zéro bénéfice sur l'unique installation existante
(décision 4 de la spec).

**La couture est nommée** : `app/src/ecran.ts` est le point **unique** où la
maison entre dans l'application. Le jour où une deuxième maison existe, c'est
le seul fichier à ouvrir.

> **En cours de renversement.** La spec du 2026-09-12
> (`docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`)
> annule cette décision : la donnée part chez Home Assistant, le type reste ici.
> Ce plan-ci (1/3) ne déplace encore aucune donnée.

## Installation

Par le wizard Nivuus. Le manifeste déclare `requires: packages: [home-manager]`,
ce qui installe le socle en premier — sans quoi ce package écrirait dans un
répertoire inexistant.

### Ce que l'installation dépose

| Depuis le dépôt | Vers `config/` | Mode |
|---|---|---|
| `dist/` | `www/wallpanel/` | remplacement d'arbre |
| `custom_components/vignette/` | `custom_components/vignette/` | remplacement d'arbre |
| `packages/home_desk.yaml` | `packages/home_desk.yaml` | copie de fichier |

### Trois gestes qui restent à l'opérateur

Le hook n'écrit **jamais** dans `configuration.yaml` : il signale, vous ajoutez.

1. **`vignette:`** en premier niveau de `configuration.yaml`. Sans elle, les
   affiches de média arrivent en pleine résolution : une affiche 2000×3000
   occupe ~23 Mo décodée et **tue la WebView des Fire 7** (4 morts en 48 s
   mesurées ; 0 à 400×600).
2. **`packages: !include_dir_named packages`** sous `homeassistant:`. Sans
   elle, `packages/home_desk.yaml` est déposé mais jamais chargé, et les trois
   écrans restent **sans luminosité adaptative, sans garde thermique et sans
   thème jour/nuit**. La même ligne sert au fragment d'intents de `home-stock`.
3. **Vérifier la `startUrl` des trois tablettes** dans Fully Kiosk : elle doit
   pointer sur `/local/wallpanel/<piece>.html`.

## Dépendances d'exécution

- **`home-manager`** — déclaré dans `requires.packages`. Dur.
- **`home-stock`** — **non déclaré**, délibérément (décision 8). L'application
  le consomme par le bus (`sensor.home_stock_next_meal`,
  `todo.home_stock_expirations`, `todo.home_stock_shopping`, et trois commandes
  websocket), jamais par un import. Sans lui, l'écran de la cuisine affiche
  **« Garde-manger non installé »** là où vivent la ligne « repas suivant » et
  la vue « Recette ». Les tablettes du salon et du bureau ne s'en aperçoivent
  pas.

## Développement

```bash
cd app && npm ci
npm run build        # ecrit dans ../dist/, SUIVI PAR GIT
npm test             # 41 fichiers vitest, 912 tests
cd .. && make test   # les 4 tests du package (python3 + PyYAML)
```

**`dist/` est versionné**, et ce n'est pas négociable : le contrat
`nivuus.dev/v1` livre par `git archive HEAD`, donc seuls les fichiers suivis
voyagent. Toute modification de `app/src/` doit être suivie d'un
`npm run build` et d'un commit de `dist/` — `make test` le vérifie
(`test_dist_a_jour`).

### Les outils de mesure

`app/outils/` joint la vraie maison, donc il lui faut son adresse :

```bash
NIVUUS_HA_DATA=<répertoire de données HA> node outils/mesurer-rendus.mjs salon 120
```

Ces chemins étaient codés en dur jusqu'au 2026-09-05, ce qui figeait l'outillage
sur une seule machine. `NIVUUS_WWW_WALLPANEL` surcharge de même le répertoire du
bundle déployé, avec le chemin du socle pour défaut.
