# `home-desk` en package Nivuus — design

**Date** : 2026-08-29
**Statut** : conception **tranchée**. L'inventaire a été relevé le 2026-08-29,
les dix décisions ouvertes ont été prises le **2026-09-04** par le propriétaire
(voir « Les décisions »), et sept mesures du même jour corrigent l'inventaire
(voir « Ce qui a changé »). Le plan qui en découle :
`docs/superpowers/plans/2026-09-04-package-home-desk.md`.

## Objectif

Faire de l'**affichage des trois tablettes murales** un package Nivuus
satellite de `home-manager`, au même titre que `home-stock`.

C'est le deuxième satellite, et il est **plus difficile que le premier**.
`home-stock` avait sa matière déjà rassemblée dans un
`custom_components/home_stock` autonome : l'extraire tenait du déménagement.
Ici la matière est éclatée sur **cinq emplacements** dont trois n'appartiennent
pas au package, et **deux générations successives cohabitent**, dont une morte
qui a l'air vivante.

## Ce que le package est

- L'application web dédiée qui tourne sur les trois tablettes Fire 7 (salon,
  bureau, cuisine) : `tools/wallpanel-app`, TypeScript + `lit`, construite par
  rollup, servie par Home Assistant depuis `config/www/wallpanel/`.
- Ses artefacts déployés (`wallpanel.js`, `wallpanel.css`, les polices et
  vidéos de `assets/`, les trois pages d'entrée `<piece>.html`).
- Le composant `custom_components/vignette`, écrit **pour ces tablettes** et
  pour rien d'autre — il part avec le package (décision 5).

## Ce que le package n'est pas

- **`home-desk` n'est pas `desk`.** `packages/desk` est la plateforme de
  bureau distant (agent Rust, `plateforme/`, `client/`,
  `docker-compose.plateforme.yml`, `docker-compose.coturn.yml`). Vérifié :
  `packages/desk` ne porte **aucun `nivuus-package.yaml`** à ce jour et
  **aucun `custom_component`**. Les deux noms se ressemblent, les deux
  périmètres n'ont aucune intersection.
- **Ce n'est pas un jeu de dashboards Lovelace.** Les dashboards
  `wallpanel-salon|bureau|cuisine` existent encore et **paraissent
  plausibles** ; ils sont périmés depuis le 2026-08-02 (mesures ci-dessous).
- **Ce n'est pas le pilotage matériel des tablettes.** L'allumage d'écran, la
  luminosité adaptative, la garde thermique et le thème jour/nuit sont des
  automations de la maison, branchées sur l'intégration `fully_kiosk` : elles
  restent au socle (voir le démêlage, cas dur n° 4).

---

## Ce qui a changé depuis le relevé du 2026-08-29

Sept faits mesurés le **2026-09-04** déplacent l'inventaire ci-dessous. Celui-ci
est conservé tel quel — il date sa mesure — et ces corrections le surchargent.

| Mesuré le 2026-09-04 | Ce que cela déplace |
|---|---|
| `wallpanel-app` porte **27 fichiers modifiés** non commités, plus 4 sauvegardes `*.backup-music-assistant-20260904` — et non 9 | La question 10 change de nature : l'arbre de travail empile trois chantiers |
| `src/pieces.ts` porte **36 références `musique_*`, zéro `ytube`** ; le bundle déployé a été reconstruit le **4 sept. 01:01** et porte `musique_salon`, `musique_cuisine`, `musique_maison` | **La Task 11 du plan `2026-09-03-music-assistant` est faite et en production.** Le télescopage entre les deux chantiers n'est pas un risque à ordonnancer : il a eu lieu |
| **La modification la plus récente de l'arbre date de 01:00:16 ; le bundle déployé de 01:01:14.** Les 27 modifications, sans exception, précèdent le build | Décisif pour la question 10 : le bundle qui tourne sur les trois tablettes a été construit à partir de **l'arbre sale entier** |
| `git diff --name-only mouvement-grammaire mouvement-film` ne rend **aucun fichier de `src/`** — seulement `outils/film/*`, `tests/film-detecteurs.test.mjs`, `outils/verifier-rendu.mjs`, `.gitignore` et un plan | Le chantier film est **de l'outillage seul**. Les modifications de `src/rendu/`, `src/media.ts`, `src/demarrage.ts` et `src/styles/base.css` ne lui appartiennent pas : c'est du travail non commité sur `mouvement-grammaire`, et il est en production |
| Les trois chemins de sortie du build pointent vers `/opt/nivuus/home-manager/config/www/wallpanel` — **non commité** | Le fait de construction n° 2 est **à moitié réparé**. Le chemin reste absolu et hors dépôt : la portabilité reste entièrement à faire |
| `tools/wallpanel/rooms.py` **modifié le 4 sept. 08:37**, avec deux sauvegardes datées ; `rooms.py` et `genere/*.yaml` portent `musique_*` | La « génération 1 morte » est **activement modifiée par deux autres chantiers**. Elle est morte pour les tablettes, pas pour le dépôt — ce qui conditionne la question 9 |
| **`configuration.yaml` ne déclare PAS `packages:`** (aucune occurrence), alors que `config/packages/home_stock_intents.yaml` est déposé | Le fragment de `home-stock` **n'est pas chargé** à ce jour. Le geste opérateur est en souffrance, et la question 6 en hérite |
| `config/www/` compte **onze** occupants (deux sauvegardes datées se sont ajoutées) | Le test qui protège `www/` doit compter les occupants, jamais les nommer |


---

## L'inventaire relevé

Tout ce qui suit a été ouvert ou mesuré le 2026-08-29 sur la machine vivante.
Les chemins sont absolus. Ce qui n'a pas pu être mesuré est signalé comme tel.

### Vue d'ensemble

| Emplacement | Nature | Volume mesuré | Versionné ? |
|---|---|---|---|
| `/opt/nivuus/HomeAssistant/data/tools/wallpanel-app/` | source de l'app (génération 2) | 115 fichiers suivis, 2 431 540 o suivis ; `node_modules` 115 Mo, `.git` 13 Mo | **oui**, dépôt git local |
| `/opt/nivuus/HomeAssistant/data/tools/wallpanel-film/` | worktree git du précédent | 119 fichiers suivis | oui (même dépôt) |
| `/opt/nivuus/home-manager/config/www/wallpanel/` | artefacts déployés | 607 523 o | **non** |
| `/opt/nivuus/home-manager/config/custom_components/vignette/` | composant HA | 173 lignes Python + manifest | **non** (aucun dépôt trouvé) |
| `/opt/nivuus/HomeAssistant/data/tools/wallpanel/` | générateur Lovelace (génération 1) | 5 fichiers Python, 1 127 lignes ; 3 YAML générés, 1 692 lignes | **non** (pas de dépôt propre) |
| `/opt/nivuus/home-manager/config/custom_templates/wallpanel.jinja` | contexte Jinja (génération 1) | 163 lignes, 6 945 o | non |
| `/opt/nivuus/home-manager/config/configuration.yaml` | 5 capteurs template (génération 1) | 21 occurrences de « wallpanel », lignes 103-166 sur 477 | non |
| `/opt/nivuus/home-manager/config/.storage/lovelace.wallpanel_*` | 3 dashboards (génération 1) | 40 235 + 41 890 + 37 702 o | non |
| `/opt/nivuus/home-manager/config/automations.yaml` | 7 automations « Tablettes » sur 121 | 283 lignes de bloc sur 4 560 | non |
| `/opt/nivuus/home-manager/config/scripts.yaml` | 5 scripts qui *touchent* les tablettes sur 43 | aucun script dédié | non |
| `/opt/nivuus/home-manager/config/secrets.yaml` | 3 clés `bleuenn_url_*` | 3 lignes sur 16 | non |
| `/opt/nivuus/HomeAssistant/data/docs/superpowers/` | 4 specs + 4 plans wallpanel | 8 093 lignes pour les 6 mesurés | non |

### A. `tools/wallpanel-app` — le cœur, et c'est un dépôt git

```
Remote            : AUCUN (git remote -v est vide)
Branche courante  : mouvement-grammaire — 91 commits, dernier 2026-08-26
Branches locales  : principal (36), moteur-mouvement (33), lot-6-garde-manger (67),
                    recette-repas-suivant (60), mouvement-grammaire (91), mouvement-film (111)
État              : 9 fichiers modifiés non commités
```

Topologie mesurée : `principal` est **ancêtre** de `mouvement-grammaire`, qui
est **ancêtre** de `mouvement-film`. Aucune divergence, aucune fusion à faire —
la même forme que `home-stock`, mais **sans remote du tout** : rien n'a jamais
été poussé nulle part.

`wallpanel-film` n'est **pas un second clone** : c'est un *worktree* du même
dépôt (`.git` est un fichier pointant vers
`…/wallpanel-app/.git/worktrees/mouvement-film`). Et le `git diff
mouvement-grammaire mouvement-film` ne touche **aucun fichier de `src/`** : les
20 commits d'écart n'ajoutent que de l'outillage de vérification
(`outils/film/banc.mjs`, `outils/film/detecteurs.mjs`,
`outils/film/scenarios.mjs`, `tests/film-detecteurs.test.mjs`). C'est un
chantier d'outillage en cours, pas une divergence produit.

Répartition des 115 fichiers suivis :

| Répertoire | Fichiers suivis | Lignes |
|---|---|---|
| `src/` | 44 | 9 278 |
| `tests/` | 43 | 12 500 |
| `docs/superpowers/` | 9 | non compté |
| `assets/` | 5 | 411 289 o (2 polices DSEG, 1 webp, 2 webm) |
| `outils/` | 3 | dont `verifier-rendu.mjs`, 286 851 o |
| `scripts/` | 3 | build : `generer-jetons.mjs`, `copier-assets.mjs`, `versionner.mjs` |
| racine | 8 | `package.json`, `rollup.config.js`, `tsconfig.json`, `vitest.config.ts`, `package-lock.json`, `README.md`, `.gitignore`, `.impeccable/config.json` |

`.gitignore` ne contient que `node_modules/` et `.superpowers/`.

**Trois faits de construction, mesurés, qui commandent toute la conception :**

1. **La sortie du build est HORS du dépôt.** `rollup.config.js` écrit dans
   `output.dir: '/opt/nivuus/HomeAssistant/config/www/wallpanel'`. Idem pour
   `scripts/copier-assets.mjs` (`SORTIE = '…/config/www/wallpanel/assets'`) et
   `scripts/versionner.mjs` (`SORTIE = '…/config/www/wallpanel'`). Donc
   `git archive HEAD` **n'emporte aucun bundle** — contrairement à
   `home-stock`, dont le bundle de 234 Ko est versionné dans
   `custom_components/home_stock/panel/`.
2. **Ce chemin en dur n'existe plus.** `/opt/nivuus/HomeAssistant/config` a
   été mesuré **absent** : la bascule du 2026-08-28 a déplacé la
   configuration vers `/opt/nivuus/home-manager/config`. `npm run build` ne
   peut donc **plus déployer** en l'état. Les fichiers en place datent du
   28 août 14:45, la bascule du même jour à 20:05. Cinq occurrences de
   `/opt/nivuus/HomeAssistant` subsistent dans le code suivi
   (`rollup.config.js`, `scripts/copier-assets.mjs`, `scripts/versionner.mjs`,
   `outils/verifier-rendu.mjs` × 2, `outils/mesurer-*.mjs`).
3. **Les trois pages d'entrée ne sont versionnées nulle part.**
   `git ls-files | grep html` ne rend **rien**. `salon.html`, `bureau.html` et
   `cuisine.html` n'existent que dans `config/www/wallpanel/`, écrits à la
   main ; `versionner.mjs` se contente de réécrire leur `?v=<empreinte>`.
   Elles sont pourtant **le point d'entrée réel des tablettes** et diffèrent de
   deux lignes seulement (`<title>` et `data-piece`). Mesuré par `diff`.

**Couplage à cette maison.** `src/` cite **66 `entity_id` distincts en dur**,
répartis en 18 domaines (16 `binary_sensor`, 7 `sensor`, 7 `light`,
6 `media_player`, 4 `todo`, 4 `calendar`, 3 `timer`, 3 `script`, 3 `scene`,
2 `vacuum`, 2 `fan`, 2 `cover`, 2 `button`, 1 chacun pour `weather`, `sun`,
`lock`, `input_boolean`, `climate`). `src/pieces.ts` (437 lignes) déclare
`PIECES: Record<'salon' | 'bureau' | 'cuisine', Piece>` — les trois pièces sont
un **type**, pas une donnée de configuration.

**Dépendances fonctionnelles mesurées** :
- `home_stock` : `sensor.home_stock_next_meal`, `todo.home_stock_expirations`,
  `todo.home_stock_shopping`, et trois commandes websocket
  (`home_stock/recipe/get`, `home_stock/meal/preview`,
  `home_stock/meal/validate`) — 15 occurrences dans `src/`.
- `vignette` : `src/media.ts` construit
  `/api/vignette?w=400&url=…` (constaté aussi dans le bundle déployé).
- Home Assistant en websocket avec le jeton de session du navigateur
  (`src/connexion.ts`) — aucune card, aucun dashboard, aucun composant
  frontend.

### B. `config/www/wallpanel/` — les artefacts déployés

```
wallpanel.js   106 753 o   28 août 14:45   (IIFE minifié, lit)
wallpanel.css   88 292 o   28 août 14:45
salon.html         393 o   |  cuisine.html  397 o  |  bureau.html  399 o
assets/         410 Ko     21 août 21:32   DSEG7/DSEG14 .woff2, eclair.webp,
                                            firepath_384.webm, flux_264.webm
Total          607 523 o
```

`www/` est **partagé** : à côté de `wallpanel/` vivent `community/` (HACS),
`nivuus-panel/`, `stellantis_vehicles/`, `custom_lovelace/`, `media/`,
`uploaded/`, `wifi-qrcode-card.js`, `claudetest.txt` et un
`tablette_salon_screenshot.jpg`. Un hook qui remplacerait `www/` détruirait
tout cela.

### C. `custom_components/vignette/` — 173 lignes, non versionnées

`manifest.json` : domaine `vignette`, `dependencies: ["http"]`,
`requirements: []`, `documentation: https://github.com/nivuus/vignette`
(dépôt **non vérifié**, aucun clone local trouvé). Le composant sert
`/api/vignette?url=<entity_picture signée>&w=<largeur>`.

Sa raison d'être est écrite dans son propre en-tête et dans
`configuration.yaml` : l'affiche 2000×3000 que Plex publie occupe ~23 Mo une
fois décodée et **tue la WebView des Fire 7**. Mesures citées par le
composant : 2000×3000 = 4 morts en 48 s ; 800×1200 = 1 mort ; 400×600 = 0 mort.

Activé par une seule ligne dans `configuration.yaml` (ligne 213) :
```yaml
vignette:
```
Aucun autre consommateur de `/api/vignette` n'a été trouvé dans `config/` en
dehors du bundle des tablettes.

### D. La génération 1, mesurée morte

Trois pièces qui **ont l'air vivantes** et ne le sont pas. Le fait est établi
par trois sources concordantes, pas par déduction :

- `/opt/nivuus/HomeAssistant/data/CLAUDE.md`, section « Tablettes murales —
  application dédiée, PAS Lovelace » (lignes 320 et suivantes) : *« Les
  dashboards `.storage/lovelace.wallpanel_*` sont PÉRIMÉS — conservés depuis le
  2026-08-02 comme filet de retour arrière. […] les modifier n'a aucun effet
  sur les tablettes. Idem pour `config/custom_templates/wallpanel.jinja`, qui
  n'alimente plus que les capteurs `sensor.wallpanel_hero_*`, eux-mêmes
  inutilisés par l'app. »*
- `tools/wallpanel-app/README.md`, encadré d'avertissement, même contenu.
- **Contrôle indépendant** : `git grep` de `wallpanel_hero`, `wallpanel_moment`
  et `conseil_meteo` dans `src/` et `tests/` du dépôt de l'app ne rend
  **qu'une seule occurrence, en commentaire** (`src/modes.ts:55`). Aucun code
  ne lit ces capteurs.

Le détail de cette génération 1 :

**`custom_templates/wallpanel.jinja`** — 163 lignes, 6 945 o. Neuf macros :
`moment_calcule`, `moment`, `conseil_meteo`, `ouverture_problematique`,
`serrure_problematique`, `voiture_a_brancher`, `alerte`, `alerte_active`,
`media_en_cours`, `hero_brut`, `hero`. Le fichier renvoie explicitement à
`tools/wallpanel/rooms.py` et `tools/wallpanel/components.py`, c'est-à-dire au
générateur Lovelace. Seuls importateurs mesurés : `configuration.yaml`
(5 imports) et le fichier lui-même (exemple de debug en commentaire).

**`configuration.yaml`, lignes 103-166** — deux blocs `template:` :
- un bloc `- sensor:` simple : `sensor.wallpanel_moment`,
  `sensor.wallpanel_conseil_meteo` ;
- un bloc `- trigger:` avec **16 entités déclencheuses**, `for: "00:00:30"`
  (l'anti-clignotement) et un `time_pattern` `minutes: "/1"`, alimentant
  `sensor.wallpanel_hero_salon`, `…_bureau`, `…_cuisine`.

Ce bloc porte un avertissement de 12 lignes sur un **renommage fait à la main
dans l'entity registry** : le slug naturel de « Wallpanel héros salon » serait
`wallpanel_heros_salon`, les `entity_id` réels sont `wallpanel_hero_salon`.
Contrôle dans `.storage/core.entity_registry` : les cinq entités existent bien
sous `sensor.wallpanel_hero_*` / `sensor.wallpanel_moment` /
`sensor.wallpanel_conseil_meteo`, plateforme `template`.

**Les trois dashboards `.storage/lovelace.wallpanel_*`** — 40 235, 41 890 et
37 702 o. Chacun référence exactement le capteur héros de sa pièce (contrôlé
par `grep`). Ils sont déclarés dans `.storage/lovelace_dashboards` avec les
`url_path` `wallpanel-salon`, `wallpanel-bureau`, `wallpanel-cuisine`, tous en
mode `storage` et `show_in_sidebar: false`.

**`tools/wallpanel/`** — le générateur qui les produisait :
`build.py` 132 l., `capture.py` 57 l., `components.py` 383 l., `rooms.py`
555 l., `tests/test_components.py` 217 l., plus `genere/{salon,bureau,cuisine}.yaml`
(525 + 567 + 600 lignes). `build.py` s'annonce lui-même : *« Compose et déploie
les trois dashboards wallpanel »*, avec un `--deploy <piece>`. Il n'a **pas de
dépôt git propre** (il vit dans l'arborescence `data/`, qui n'en est pas un
pour cette partie — non vérifié plus avant).

### E. `automations.yaml` — 7 automations dédiées sur 121

Fichier : 4 560 lignes, 161 659 o, 121 automations. Dix-neuf mentionnent une
tablette ; **sept lui sont dédiées** (alias commençant par « Tablettes ») :

| id | alias | lignes du bloc |
|---|---|---|
| `tablettes_luminosite_adaptative` | Tablettes - Luminosité adaptative | 60 |
| `tablettes_presence_lit` | Tablettes - Allumage écran (présence, jour/nuit, lumières) | 66 |
| `auto_fbde9552` | Tablettes - Thème au démarrage HA | 48 |
| `auto_eb4fb6f0` | Tablettes - Synchronisation thème jour/nuit (résilience reconnexion) | 34 |
| `auto_6546e7e0` | Tablettes - Thème clair au lever du soleil | 28 |
| `automation.tablettes_theme_sombre_au_coucher_du_soleil` | Tablettes - Thème sombre au coucher du soleil | 25 |
| `auto_56d94a1e` | Tablettes — Reload browser après démarrage HA | 22 |

**283 lignes sur 4 560, soit 6,2 %.**

Les douze autres citent une tablette comme un acteur parmi d'autres : « SSTV -
Afficher sur tablette », « Télévision - Gestion lumières et écrans tablettes
selon média », « Sécurité - Popup clavier alarme en attente », « Cuisine -
Gestion complète du minuteur », « Éclairage - Interrupteur cuisine », les deux
automations de capteurs indisponibles, « Voiture - Resync climatisation »
(seule occurrence de « wallpanel » du fichier, en commentaire, ligne 3716), et
deux webhooks « Vie - … ».

Ces sept automations pilotent l'intégration `fully_kiosk`, pas l'application :
`switch.tablette_*_screen`, `number.tablette_*_screen_brightness`,
`sensor.tablette_*_battery_temperature`, `button.tablette_*_load_start_url`.
Elles marcheraient à l'identique si les tablettes affichaient autre chose.

### F. `scripts.yaml` — aucun script dédié

Fichier : 1 156 lignes, 37 329 o, 43 scripts. Cinq touchent une tablette,
**aucun ne lui appartient** :

| script | rôle | note mesurée |
|---|---|---|
| `afficher_recette_cuisine` | Cuisine - Afficher recette | **inerte** (cf. ci-dessous) |
| `afficher_repas_prevu` | Cuisine - Afficher le repas prévu | **inerte** |
| `routine_depart_maison` | routine de la maison | éteint aussi les écrans |
| `routine_coucher_complet` | routine de la maison | idem |
| `serrure_tap_ouvrir_ou_verrouiller` | action de la serrure | seule occurrence de « wallpanel » du fichier, dans la `description` |

`CLAUDE.md` de `data/` documente que les deux premiers sont **inertes depuis le
lot 6** : ils injectent une iframe via `browser_mod` sur la tablette cuisine,
dont le `browser_mod` est `unavailable` depuis qu'elle affiche l'application
dédiée. Ils citent encore `sensor.grocy_meal_plan` et
`/local/grocy-recipes.html`, page sortie de `www/` le 2026-08-22.

### G. `secrets.yaml` — 3 clés sur 16, et elles ne sont référencées nulle part

Le fichier fait 16 lignes / 1 395 o et porte : `xiaomi_cloud_token`,
`xiaomi_cloud_username`, `xiaomi_cloud_password`, `alarm_code`,
`bleuenn_url_cuisine`, `bleuenn_url_salon`, `bleuenn_url_bureau`.

Les trois `bleuenn_url_*` sont **les seules occurrences de « wallpanel » du
fichier** (3 sur 3). Leur forme :

```
http://192.168.0.1:8124/bleuenn-hotword.html?token=<JWT>&redirect=<URL encodée
vers http://192.168.0.1:8123/wallpanel-<piece>/default>
```

Chacune porte un **JWT de longue durée** (le même sur les trois, `exp`
2089 selon le payload — non décodé au-delà de la lecture du champ) et pointe
vers l'URL d'un dashboard Lovelace de la **génération 1**, donc périmée.

**Mesure décisive** : `grep -rl "bleuenn_url"` sur `config/` hors sauvegardes
(y compris `.storage/`, `appdaemon/`, `automations/`, `packages/`) ne trouve
**aucun consommateur**. Ces trois clés ne sont référencées par aucun
`!secret`. Le port 8124 n'apparaît nulle part ailleurs dans les YAML.

Ce que cela ne prouve pas : la `startUrl` de Fully est stockée **sur les
tablettes**, pas dans HA. `CLAUDE.md` la relève au 2026-08-06 comme
`/local/wallpanel/<piece>.html` sur les trois. La chaîne bleuenn n'est donc
plus la porte d'entrée, mais l'état réel des tablettes **n'a pas été
re-mesuré** ici (aucune requête n'a été envoyée aux tablettes).

### H. Ce que Home Assistant expose autour des tablettes

`.storage/core.config_entries` : **quatre** entrées `fully_kiosk` —
`Tablette Bureau` (192.168.0.138), `Tablette Salon` (192.168.0.218),
`Tablette Cuisine` (192.168.0.159) et une quatrième intitulée `Amazon Fire`
sans `host` dans `data` (contenu non inspecté plus avant). Plus une entrée
`browser_mod`.

`.storage/core.entity_registry` : **142 entités** dont l'`entity_id` contient
`tablette` — 35 `sensor`, 26 `button`, 20 `switch`, 16 `number`,
15 `binary_sensor`, 9 `automation`, 8 `notify`, 4 `camera`, 4 `media_player`,
4 `image`, 1 `input_boolean`. Toutes viennent de `fully_kiosk`, aucune du
package envisagé.

### I. La documentation

Dans `/opt/nivuus/HomeAssistant/data/docs/superpowers/` : 4 specs et 4 plans
« wallpanel », dont six mesurés à **8 093 lignes** cumulées
(`2026-07-31-wallpanel-redesign`, `2026-08-01-wallpanel-app`,
`2026-08-02-wallpanel-contextuel`, plus `2026-08-06-moteur-mouvement-tablettes`
non compté). Dans le dépôt de l'app : 9 fichiers `docs/superpowers/` propres
(5 specs, 4 plans).

---

## Le démêlage proposé

### Le tableau

| Matière | Part | Reste | Partagé |
|---|---|---|---|
| `tools/wallpanel-app/src`, `tests`, `assets`, `scripts`, `outils`, `docs` | **part** — c'est le package | | |
| `config/www/wallpanel/` (bundle, css, assets, 3 pages) | **part** — le hook les dépose | | |
| `custom_components/vignette/` | **part** (décision 5) | | |
| `config/www/` lui-même | | | **partagé** — 9 autres occupants |
| `custom_templates/wallpanel.jinja` | | | **partagé** (cas dur 1) |
| `configuration.yaml` lignes 103-166 | | **reste** (cas dur 2) | |
| `.storage/lovelace.wallpanel_*` + `lovelace_dashboards` | | **reste** (cas dur 3) | |
| `tools/wallpanel/` (générateur Python) | | **reste** hors package (cas dur 3) | |
| 7 automations « Tablettes » | **part**, réécrites en fragment (décision 6) | | |
| 12 autres automations, 5 scripts | | **reste** — matière de la maison | |
| `secrets.yaml` : `bleuenn_url_*` | | **reste** (cas dur 5) | |
| entrées `fully_kiosk`, 142 entités `tablette_*` | | **reste** — état HA, jamais versionné | |

### Les cas durs

Les cas évidents ne méritent pas d'explication ; ceux-ci, si.

#### Cas dur 1 — `wallpanel.jinja` : un fichier mort dans un répertoire partagé

`custom_templates/` porte quatre `.jinja` : `easy_time.jinja` (2 119 l.),
`maintenance.jinja` (88 l.), `voiture.jinja` (229 l.) et `wallpanel.jinja`
(163 l.). Trois n'ont rien à voir avec les tablettes. Le répertoire est donc
**partagé**, exactement comme `custom_sentences/fr/` l'est pour `home-stock` :
un hook ne doit jamais le remplacer, seulement y écrire ou en retirer un
fichier nommé.

Mais la vraie difficulté n'est pas le partage, c'est que **ce fichier ne sert
plus au package**. Il alimente cinq capteurs qu'aucune ligne de l'app ne lit.
Trois issues ; la décision 3 a retenu la deuxième, assortie d'une annotation datée :

- **le package l'emporte** : il devient sa matière historique et le hook le
  redépose. Coût : le package transporte du code mort et ressuscite à chaque
  installation cinq capteurs et un déclencheur à 16 entités.
- **il reste au socle, inchangé** : rien ne casse, rien ne se nettoie. Coût
  nul aujourd'hui, un piège à relecture permanent — c'est exactement ce qui a
  déjà coûté « plusieurs allers-retours de questions inutiles » selon la
  mémoire du projet.
- **il est retiré du socle**, avec le bloc `configuration.yaml` qui le lit.
  Coût : une écriture dans le fichier le plus précieux de l'installation, que
  ni `home-manager` ni `home-stock` ne s'autorisent.

**Proposition** : ne rien emporter et ne rien retirer dans ce design — mais le
consigner comme dette nommée, et laisser le retrait au propriétaire. Un
package ne doit pas contenir de code mort ; un hook ne doit pas nettoyer la
maison de quelqu'un d'autre.

#### Cas dur 2 — `configuration.yaml` : le fichier que personne n'écrit

Les lignes 103-166 sont indissociables de `wallpanel.jinja` : les capteurs
n'existent que pour appeler ses macros. Elles portent en outre l'**avertissement
de renommage** (12 lignes) sur un état qui ne vit **que dans l'entity
registry**, et que ni le socle ni un satellite ne peuvent recréer.

La règle est déjà écrite deux fois dans la suite :
`config/configuration.yaml` est dans le `PRESERVED` de
`home-manager/hooks/install.py` (il n'est créé que s'il manque, jamais
réécrit), et `home-stock` a explicitement **rejeté** l'insertion idempotente
dans ce fichier au profit d'un message dans le flux de progression.

**Décision proposée** : `home-desk` **n'écrit jamais dans
`configuration.yaml`**, sans exception. Là où le composant `vignette` a besoin
de sa ligne d'activation, le hook la **signale** avec la ligne exacte à
ajouter, comme `home-stock` le fait pour `packages: !include_dir_named
packages`. En regard, et par le même précédent, le bootstrap
`stack/config/configuration.yaml` de `home-manager` pourrait gagner la ligne
`vignette:` — sans effet sur les installations existantes, mais toute
installation neuve serait complète. Ce changement d'une ligne au socle est
**hors du périmètre de ce package** et doit être décidé avec lui.

#### Cas dur 3 — la génération 1 : ni au package, ni détruite par lui

Les trois dashboards `.storage`, le générateur Python `tools/wallpanel/`, et
les YAML de `genere/` forment une génération complète, morte depuis le
2026-08-02, **conservée volontairement comme filet de retour arrière**.

Un package ne peut pas les emporter : ils décrivent un affichage que le package
ne produit plus. Un hook ne peut pas les supprimer : `.storage` est l'état de
Home Assistant, et `home-manager` a posé la règle que le package ne versionne
rien de `config/`.

**Décision proposée** : hors périmètre, dans les deux sens. Le design les
**nomme** pour qu'ils cessent d'être un piège, et le retrait — s'il a lieu —
est un geste de production distinct, comme la suppression de
`config/stacks/mosquitto/` l'a été pour le socle.

#### Cas dur 4 — les 7 automations « Tablettes » : la frontière matériel / affichage

C'est le partage le moins évident de l'inventaire, parce que les deux réponses
se défendent.

Pour le départ vers le package : elles ne concernent que les trois tablettes,
elles portent leur nom, et une installation neuve sans elles laisse trois
écrans allumés en permanence.

Pour le maintien au socle, **et c'est la proposition retenue** : elles ne
pilotent **jamais l'application**. Elles pilotent l'intégration `fully_kiosk`
et ses `switch`/`number`/`button` — matériel, pas affichage. Deux d'entre
elles portent une logique de la maison (garde thermique par tablette, réaction
à la présence au lit, aux lumières et à l'éclairement) qui **cite des entités
extérieures aux tablettes**. Surtout, elles ont un **coût de dépôt** que
`home-stock` n'a pas eu : le socle charge les automations depuis
`automations.yaml`, un fichier unique et partagé, que l'interface graphique de
Home Assistant réécrit entièrement. Y insérer sept blocs depuis un hook, c'est
prendre en charge une fusion sur le fichier que le propriétaire édite le plus.

`home-stock` a résolu le même problème en ne livrant que ce que HA charge
**par répertoire** : `blueprints/automation/home_stock/`, `custom_sentences/fr/`,
et un fragment `packages/<nom>.yaml`. La voie propre existe donc, si le
propriétaire veut que le package emporte ces automations : les **réécrire** en
un fragment `packages/home_desk.yaml` chargé par `!include_dir_named packages`.
C'est un vrai travail de réécriture, pas un déplacement — et c'est la voie
retenue par la décision 6.

#### Cas dur 5 — `secrets.yaml` : trois JWT qui ne peuvent pas voyager

Trois clés, trois JWT de longue durée, trois URL qui pointent vers des
dashboards périmés, **zéro consommateur mesuré**.

La règle est absolue et ne se discute pas : **rien de `secrets.yaml` ne part
dans un dépôt**, ni la valeur, ni un gabarit qui en aurait la forme.
`secrets.yaml` n'est pas versionné par le socle, il n'est pas dans son
`stack/`, et il n'est pas dans son `PRESERVED` parce qu'il n'est jamais touché
du tout.

Ce que `home-desk` peut faire, si un jour il a besoin d'un secret (il n'en a
aucun aujourd'hui : l'app s'authentifie avec le jeton de session du navigateur,
`src/connexion.ts`) : poser une question `type: secret` dans un `wizard.yaml`,
comme `home-manager` le fait pour le mot de passe du broker MQTT. Aujourd'hui,
rien.

Ce que le propriétaire peut faire, et lui seul : constater que ces trois clés
sont orphelines, et décider de les révoquer. Un JWT de longue durée qui
n'ouvre plus rien reste un JWT valide. La décision 7 les révoque, après relevé
de la `startUrl` des trois appareils.

#### Cas dur 6 — le bundle : le seul endroit où `home-desk` diverge de `home-stock`

`home-stock` versionne son bundle compilé (234 Ko) **dans** son
`custom_components/`, donc `git archive HEAD` l'emporte et l'installateur n'a
jamais besoin de Node. C'est la solution élégante, et elle ne s'applique pas
ici sans une modification du build : `rollup.config.js` écrit **hors du
dépôt**, dans un répertoire de production.

Trois issues, avec leurs coûts ; la décision 2 a retenu la première :

| Issue | Ce que ça coûte |
|---|---|
| Le build écrit dans `dist/` **suivi par git**, le hook copie `dist/` vers `www/wallpanel/` | ~195 Ko de binaire réécrits à chaque build dans l'historique git ; c'est exactement ce que `home-stock` assume |
| Le build reste hors dépôt, `hooks/install.py` **construit** (npm + rollup) | Node et 115 Mo de `node_modules` sur l'ISO ou un accès réseau pendant l'installation — contraire à la logique de `git archive` que le contrat impose |
| Le bundle est un artefact de release attaché hors git | Un mécanisme que le contrat `nivuus.dev/v1` n'a pas |

**Proposition** : la première. Elle est la seule compatible avec « seuls les
fichiers suivis par git voyagent », et elle a un précédent dans la suite.

Elle entraîne trois corrections dans le dépôt de l'app, indépendantes du
packaging et de toute façon nécessaires puisque le chemin actuel n'existe
plus : sortie du build relative au dépôt, **génération** des trois
`<piece>.html` (aujourd'hui écrites à la main et versionnées nulle part) à
partir d'un gabarit et de la liste des pièces, et les cinq chemins
`/opt/nivuus/HomeAssistant` restants rendus configurables.

---

## Le manifeste envisagé

```yaml
apiVersion: nivuus.dev/v1
name: home-desk
version: 1.0.0
label: "Tablettes murales (affichage des trois écrans)"
tier: userspace

# Le deuxième satellite. `requires.packages` fait installer home-manager AVANT
# ce package : le hook depose son bundle dans le `config/www/` que le socle
# vient de creer, et son composant dans `config/custom_components/`. Sans cette
# ligne, le moteur ordonne alphabetiquement — et `home-desk` trie AVANT
# `home-manager`, ce qui est precisement le bug d'origine du champ.
requires:
  packages: [home-manager]

hooks:
  install: hooks/install.py
```

Chaque absence est un choix, sur le modèle de `home-stock` :

- **pas d'`apt:`** — l'application est du JavaScript servi par Home Assistant ;
  `custom_components/vignette/manifest.json` déclare
  `requirements: []` et sa seule `dependency` est `http`, composant interne de
  HA. Rien à installer sur la machine. La décision 2 verrouille ce point : un
  bundle construit à l'installation aurait exigé `apt: [nodejs, npm]`, ce qui
  fut un argument de plus contre cette issue.
- **pas de `wizard:`** — confirmé par la décision 4. Le chemin de dépôt
  vient du socle, l'app s'authentifie avec le jeton de session du navigateur,
  et les 66 `entity_id` en dur ne sont pas des questions qu'on pose à un
  opérateur.
- **pas de `claims:` ni de `requires.capabilities:`** — les tablettes sont
  jointes par le réseau, via `fully_kiosk`. Aucun matériel local n'est réclamé.
- **pas de hook `activate`** — même raisonnement que `home-stock`, et la même
  dette : le tri topologique du 2026-08-28 ordonne les `install`, **pas** les
  `activate` (unités `nivuus-package-activate@<nom>.service`, toutes dans
  `multi-user.target.wants`, sans ordre garanti entre elles). Le dépôt se fait
  donc en phase `install`, avant que le socle ne démarre Home Assistant.
- **`requires.packages` ne cite pas `home-stock`** — décision 8. L'app le
  consomme (15 occurrences dans `src/`), mais **par des entités et des
  commandes websocket**, jamais par un import. Sans `home-stock`, la ligne
  « repas suivant » et la vue recette de la cuisine sont muettes ; les deux
  autres tablettes ne s'en aperçoivent pas. La décision 8 corrige le *silence*
  de ce cas : la cuisine affiche un état nommé, jamais un vide.

---

## Les hooks

Un seul, `hooks/install.py`, sur le modèle exact de `home-stock` — mêmes
règles, mêmes primitives, mêmes raisons.

**Règle 1 — il refuse si le socle est absent.** Si
`{root}/opt/nivuus/home-manager/config` n'existe pas, il sort en erreur en le
disant. `requires.packages` bloque déjà le cas au wizard, mais le hook tourne
aussi en autonome (`--root /`, `config.json` écrit à la main) où rien ne l'a
validé.

**Règle 2 — il remplace ce qui porte son nom, il copie dans ce qu'il partage.**

| Source (dépôt) | Destination sous `{root}/opt/nivuus/home-manager/config/` | Mode | Pourquoi |
|---|---|---|---|
| `dist/` (bundle, css, assets, pages) | `www/wallpanel/` | **remplacement d'arbre** | le répertoire porte le nom du package ; un fichier retiré entre deux versions doit disparaître |
| `custom_components/vignette/` | `custom_components/vignette/` | **remplacement d'arbre** | idem, et les `__pycache__` périmés seraient chargés par HA |
| `packages/home_desk.yaml` | `packages/home_desk.yaml` | **copie de fichier** | `packages/` est PARTAGÉ — `home_stock_intents.yaml` y vit déjà. Remplacer le répertoire effacerait le travail de l'autre satellite |

`www/` lui-même est **partagé** — **onze** occupants mesurés au 2026-09-04 —
donc le hook ne le remplace jamais : il ne remplace que `www/wallpanel/`.
`config/packages/` l'est aussi, pour la même raison et avec la même règle que
chez `home-stock` : un fichier est copié, jamais un répertoire.

Le remplacement reprend le `replace_tree()` de `home-stock` : copie vers un
voisin temporaire, puis `os.replace()` atomique. Le motif y a été introduit
après avoir mesuré 291 lectures sur fichier absent pendant la fenêtre
`rmtree` + `copytree` — et le bundle des tablettes est lu par **trois clients
qui rechargent tout seuls**, ce qui rend la fenêtre plus dangereuse encore,
pas moins.

**Règle 3 — deux exécutions concurrentes se sérialisent.** Reprise du
`exclusive_deposit()` de `home-stock` : `flock` exclusif sur `config_dir`,
qui existe forcément (règle 1 vient de le vérifier) et n'est l'artefact
d'aucune des deux exécutions.

**Règle 4 — il n'écrit jamais dans `configuration.yaml`, et il signale DEUX
manques.** Il **contrôle** deux lignes, et pour chacune, si elle manque, l'écrit
dans son flux de progression avec la ligne exacte à ajouter et la conséquence
nommée :

1. `vignette:` — sans elle, les affiches de média arrivent en pleine résolution
   sur les tablettes, ce qui a déjà tué la WebView (4 morts en 48 s à
   2000×3000). *Mesuré présent le 2026-09-04, ligne 491.*
2. `packages: !include_dir_named packages` — sans elle, le fragment
   `packages/home_desk.yaml` est déposé et **jamais chargé** : les trois écrans
   restent sans luminosité adaptative, sans garde thermique et sans thème
   jour/nuit. *Mesuré ABSENT le 2026-09-04 — le fragment d'intents de
   `home-stock` est dans le même cas.* La détection reprend le
   `declares_packages()` de `home-stock`, capture du répertoire comprise. La recherche est textuelle, pas un `yaml.safe_load` —
`configuration.yaml` est plein de tags `!include` et `!secret` que le parseur
standard refuse — et tolérante à l'encodage, exactement comme
`declares_packages()` chez `home-stock`.

**Ce que le hook ne fait pas** : il ne touche ni `automations.yaml`, ni
`scripts.yaml`, ni `secrets.yaml`, ni `.storage/`, ni `custom_templates/`. Le
retrait des sept blocs d'`automations.yaml` que la décision 6 entraîne est un
**geste de production**, exécuté une fois par la Task 8 du plan et après une
porte de vérification — jamais par le hook, à chaque installation.

---

## Le chantier `requires.packages` : livré, et `home-desk` en est le cas d'école

**`home-desk` n'est plus bloqué.** Le chantier est implémenté, commité et
vérifié une seconde fois le 2026-09-04.

Le mandat de ce design le décrivait comme non joué, avec un moteur qui
rejetterait un manifeste portant `requires.packages`. Le contrôle dit
l'inverse, et il est reproductible :

| Contrôle | Résultat |
|---|---|
| `installer/installer/packages/manifest.py` | porte `REQUIRES_KEYS = ("capabilities", "features", "packages")` (l. 42) et le champ `packages: tuple[str, ...] = ()` (l. 86) |
| `installer/installer/packages/dependencies.py` | **existe** |
| `installer/installer/install-engine/steps/packages.py` | importe `install_order` et `missing_dependencies` (l. 30-31) et les appelle (l. 166, 170) |
| `installer/installer/webapp/main.py` | expose `"requires_packages": list(manifest.packages)` (l. 86) |
| `python3 scripts/tests/test_packages_dependencies.py` | `OK - all dependency tests passed` |
| `python3 scripts/tests/test_packages_manifest.py` | `OK - all manifest contract tests passed` |
| `python3 scripts/tests/test_packages_plan_order.py` | `OK - plan order tests passed` |
| `git log` de `installer` | `510242b feat(packages): requires.packages dans le contrat nivuus.dev/v1`, `7fba845 feat(packages): tri topologique et validation des dependances` |
| `git status` de `installer` | **propre** |
| `CHANGELOG.md`, section « Non publié » | « Contrat `nivuus.dev/v1` : `requires.packages` déclare les packages pré-requis. » |

Contrôle final, avec le **vrai parseur du moteur** sur le manifeste de
`home-stock` : `packages == ('home-manager',)`.

**Le moteur nomme `home-desk`.** Ce n'est pas une inférence : la docstring de
`installer/installer/packages/dependencies.py` cite ce package comme le cas qui
a motivé le champ —

> *« Ce n'est pas une hypothèse : `plan_packages()` ordonne par
> `sorted(selected)`, et `home-desk` trie AVANT `home-manager`. L'ordre
> alphabétique est exactement le mauvais. »*

et le commentaire du champ `packages` dans `manifest.py` le répète : *« The
engine orders installs alphabetically by default, which puts `home-desk` before
`home-manager`: a satellite would drop its custom_component into a directory
its base package has not created yet. »* Ce que le moteur attend de ce
manifeste est donc écrit dans le moteur.

### Ce que cela implique sur l'ordonnancement

- Le manifeste de `home-desk` peut porter `requires: packages: [home-manager]`
  dès aujourd'hui, sans rien attendre.
- Le tri topologique de Kahn place `home-manager` avant `home-desk`, **contre
  l'ordre alphabétique** — `home-desk` trie avant `home-manager`, et c'est le
  bug qui a justifié le champ. `home-desk` est donc le **cas d'école** du
  chantier, pas seulement son premier exemple de documentation.
- Un pré-requis absent du support ou présent mais non coché échoue **au
  wizard**, avant `check_conflicts()` et avant tout hook `resolve`, donc avant
  le partitionnement.
- Une clé inconnue sous `requires:` est désormais une **erreur** de manifeste
  (un `package:` au singulier ne passe plus en silence).
- **La dette reste sur les `activate`** : le tri ordonne les `install`, pas les
  unités `nivuus-package-activate@*`. Sans conséquence ici, puisque ce package
  n'en a pas — mais c'est une raison de plus pour qu'il n'en ait pas.

Ce qui **bloquait réellement** `home-desk` n'était donc pas le moteur, mais
l'état de sa propre matière : un dépôt sans remote, un build qui écrit hors du
dépôt vers un chemin absolu, et trois pages d'entrée versionnées nulle part.
Les décisions du 2026-09-04 lèvent les trois — dépôt neuf (décision 1), `dist/`
suivi par git (décision 2), pages générées (Task 2 du plan).

---

## Tests envisagés

Style du dépôt `installer`, comme `home-stock` : scripts autonomes,
`python3` + PyYAML, pas de pytest. Deux cibles séparées dans le `Makefile`,
`test` pour le package et `test-integration` pour la suite existante — ici
`npm test` (43 fichiers suivis sous `tests/`, 12 500 lignes), qui exige Node
et ne peut donc pas être la cible par défaut.

- **`test_manifest_contract`** — le manifeste passe le **vrai** parseur du
  moteur quand `NIVUUS_INSTALLER_DIR` est fourni, une revérification locale
  sinon ; `requires.packages` vaut `("home-manager",)` ; ni `apt`, ni `wizard`,
  ni hook `activate`.
- **`test_install_hook`** — les deux arbres et le fragment déposés aux bons chemins ; le
  **refus quand le socle est absent** ; l'idempotence ; un fichier obsolète
  présent avant et **absent après** ; **tous les autres occupants de `www/` et
  de `packages/` vérifiés intacts** après le dépôt — comptés, jamais nommés,
  puisque leur nombre bouge (neuf le 2026-08-29, onze le 2026-09-04) ; c'est le
  test qui protège du bug le plus coûteux imaginable ici ; les **deux**
  signalements de la règle 4, chacun présent quand la ligne manque et muet
  quand elle est là ; deux exécutions concurrentes qui ne s'entrelacent pas.
- **`test_dist_portable`** — `dist/` est réellement suivi par git (décision 2),
  il porte les cinq artefacts attendus, et **aucun chemin
  `/opt/nivuus/HomeAssistant` ni `/home/mallanic` ne survit** dans ce qui est
  déposé. Transposition du `test_compose_portable` de `home-manager`.
- **`test_dist_a_jour`** — le corollaire indispensable d'un bundle versionné :
  reconstruire depuis `app/src/` doit rendre un `dist/` identique à celui qui
  est commité. Sans lui, la seule chose que la décision 2 garantit est qu'un
  bundle est livré — pas qu'il corresponde aux sources livrées avec.

Aucun test ne touche la production : `--root` pointe vers un répertoire
temporaire.

---

## Ce que ce document ne fait pas, et ce que le plan fera

**Ce document** ne crée aucun dépôt, ne déplace aucun fichier, n'écrit aucune
ligne de code : il relève, il démêle, il consigne des décisions. Le plan
`2026-09-04-package-home-desk.md` exécute.

Ce qui reste **hors périmètre du plan lui-même**, et le restera :

- il ne supprime ni les dashboards Lovelace périmés, ni `wallpanel.jinja`, ni
  les cinq capteurs `sensor.wallpanel_*` — il les **date et les annote** sur
  place (décision 3), et consigne leur retrait comme une dette de
  `home-manager` ;
- il ne rend pas l'application installable ailleurs que dans cette maison : les
  66 `entity_id` et les trois pièces restent en dur, et le README le dit
  (décision 4) ;
- il n'écrit jamais dans `configuration.yaml` — les deux lignes dues sont
  **signalées** par le hook, ajoutées par l'opérateur ;
- il n'insère rien dans `automations.yaml` : il en **retire** sept blocs, une
  fois, après avoir constaté leur remplaçant chargé (décision 6).

Ce que le plan **fait** et que ce design ne faisait pas : il crée le dépôt
neuf, réécrit les sept automations, révoque les trois jetons après relevé, et
archive la génération 1 une fois le chantier music-assistant clos.

**Ce qui n'est toujours pas mesuré** : l'état réel des trois tablettes. Aucune
requête ne leur a été envoyée à ce jour. C'est la Task 11 du plan qui relève
leur `startUrl`, et c'est pourquoi elle précède la révocation.

---

## Les décisions

Les dix questions ouvertes du 2026-08-29 sont tranchées au 2026-09-04. Chacune
porte son **motif**, ce qu'elle **coûte si elle s'avère fausse**, et le **prix
de son renversement** — pour que rouvrir le sujet un jour se fasse sur les deux
ou trois décisions qui le méritent, pas sur les dix.

### 1. Le dépôt : **neuf**, l'arborescence importée en un seul commit

Les 91 commits de `wallpanel-app` ne sont pas repris.

*Motif* : le dépôt d'origine n'a **aucun remote** — rien n'y a jamais été
poussé, donc son historique n'est partagé avec personne et sa perte ne
désynchronise rien. Reprendre l'historique aurait exigé de choisir laquelle des
six branches devient `main` et de trier 27 modifications avant d'écrire la
première ligne du package.

*Coût si c'est faux* : le raisonnement de 91 commits — refonte « grammaire de
mouvement », lot garde-manger, moteur de mouvement — n'est plus lisible que par
les 9 fichiers `docs/superpowers/` du dépôt d'origine, qui **entrent dans
l'import** précisément pour cette raison. Le dépôt d'origine n'est pas
supprimé : il reste consultable en place.

*Renversement* : **cher**. Une fois `home-desk` peuplé et commité, greffer 91
commits antérieurs demande une réécriture d'historique. À rouvrir avant la
tâche 1, jamais après.

### 2. Le bundle : **versionné**, dans un `dist/` suivi par git

*Motif* : le contrat livre par `git archive HEAD` — seuls les fichiers suivis
voyagent. Construire à l'installation exigerait `apt: [nodejs, npm]` et 115 Mo
de `node_modules` sur la cible, contre la logique même du contrat.
`home-stock` versionne déjà son bundle de 236 Ko dans
`custom_components/home_stock/panel/` : le précédent existe et il a tenu.
L'argument contre — ~195 Ko de binaire réécrits dans l'historique à chaque
build — est **annulé par la décision 1** : un dépôt neuf n'a pas d'historique
accumulé à alourdir.

*Contenu de `dist/`* : `wallpanel.js`, `wallpanel.css`, les trois
`<piece>.html` **générées**, et `assets/`. Les cinq fichiers d'`assets/`
(411 Ko, inchangés depuis le 21 août) y sont **dupliqués depuis `app/assets/`
par le build**. C'est 411 Ko payés une fois — git stocke par contenu, un
fichier inchangé ne crée pas de nouveau blob — et le prix est délibéré : il
rend `dist/` **complet**, donc déposable par **un seul `replace_tree()`
atomique**, identique à celui de `home-stock`. L'alternative (déposer `dist/`
puis `app/assets/` en deux gestes) romprait l'atomicité sur un répertoire que
**trois clients rechargent tout seuls**.

*Coût si c'est faux* : un `dist/` obsolète par rapport à `src/` serait déposé
sans que rien ne le signale. C'est ce que `test_dist_a_jour` existe pour
empêcher.

*Renversement* : **modéré**. Il change le tableau de dépôt du hook et la forme
du dépôt, pas le code de l'application.

### 3. `wallpanel.jinja` et les cinq capteurs : **ils restent au socle**, et leur mort est écrite sur place

*Motif* : les emporter ferait transporter à `home-desk` du code mort et
réinstaller un déclencheur à 16 entités sur chaque machine. Les retirer coûte
une écriture manuelle dans `configuration.yaml`, la perte du filet de retour
arrière du 2026-08-02, et la disparition de cinq entités dont le renommage
manuel `hero` / `heros` ne vit **que dans l'entity registry** et n'est pas
reproductible.

Le seul défaut de ce choix est le **piège à relecture**, et il se ferme à coût
nul : un commentaire daté est posé en tête de `wallpanel.jinja` et au-dessus
des lignes 103-166 de `configuration.yaml`, disant qu'aucune ligne de `src/`
ne lit ces capteurs, à quelle date c'est mesuré, et **par quelle commande le
remesurer**.

*Le retrait lui-même est consigné comme une dette de `home-manager`*, pas de
`home-desk` : c'est de l'hygiène du socle, sur des fichiers que le socle
possède.

*Coût si c'est faux* : nul aujourd'hui. Si un consommateur non mesuré de
`sensor.wallpanel_hero_*` existait, ce choix est précisément celui qui ne le
casse pas.

*Renversement* : **bon marché** dans les deux sens.

### 4. La portée : **package propre à cette maison**, assumé et écrit

*Motif* : `src/` cite 66 `entity_id` en dur et `src/pieces.ts` déclare les
trois pièces comme un **type TypeScript**, pas comme une donnée. Une base
paramétrable coûte une refonte de `pieces.ts`, `modes.ts` et des 43 fichiers de
tests, pour zéro bénéfice sur l'unique installation existante.

Ce choix s'écrit **en toutes lettres** dans le `README.md` et dans le `label:`
du manifeste. Un package qui se prétend générique et ne l'est pas est pire que
celui qui l'avoue : il produit chez un tiers un écran d'entités inexistantes,
sans message.

*Couture nommée* : `app/src/pieces.ts` reste le **point unique** où la maison
entre dans l'application. Aucune autre couche n'acquiert d'`entity_id` en dur
au cours de ce chantier. Le jour où une deuxième maison existe, la
paramétrisation a un seul fichier à ouvrir.

*Coût si c'est faux* : une deuxième installation demande la refonte reportée.

*Renversement* : **bon marché**, et la couture le garde ainsi.

### 5. `custom_components/vignette` : **il part avec `home-desk`**

*Motif* : 173 lignes écrites pour les Fire 7, aucun autre consommateur mesuré
dans `config/`. L'intégrité de l'affichage en dépend directement — l'affiche
2000×3000 de Plex occupe ~23 Mo décodée et tue la WebView : 4 morts en 48 s
mesurées, 0 à 400×600. Un package doit maîtriser la dépendance dont dépend sa
propre intégrité. Le laisser au socle ferait grossir celui-ci pour le compte
d'un satellite et scinderait la propriété ; en faire un troisième package
serait un manifeste, un hook et un dépôt pour 173 lignes.

*Correction due* : son `manifest.json` annonce
`documentation: https://github.com/nivuus/vignette`, dépôt **non vérifié**. La
tâche qui l'importe vérifie ce dépôt ; s'il n'existe pas, le champ est corrigé
pour dire la vérité — il n'y a pas de troisième issue, un manifeste qui pointe
vers rien est un piège de plus.

*Coût si c'est faux* : un service générique de redimensionnement devient
invisible à qui n'installe pas les tablettes.

*Renversement* : **bon marché** — déplacer l'arbre vers `home-manager/stack/`
et retirer une ligne du tableau de dépôt.

### 6. Les 7 automations « Tablettes » : **réécrites en fragment `packages/home_desk.yaml`**

*Motif* : les laisser au socle livrerait trois écrans **sans luminosité
adaptative, sans garde thermique et sans thème jour/nuit** — le package ne
remplirait pas sa fonction. Les insérer dans `automations.yaml` fusionnerait
dans le fichier que l'interface de Home Assistant réécrit en entier : écarté.
La voie propre est celle de `home-stock` — ne livrer que ce que HA charge **par
répertoire**.

L'argument qui tranche est le partage du coût : le fragment exige
`packages: !include_dir_named packages` dans `configuration.yaml`, ligne que
**`home-stock` réclame déjà**. Elle est due de toute façon, et elle servira aux
deux satellites.

*Fait mesuré qui alourdit ce choix, et que le plan doit porter* : au
2026-09-04, `configuration.yaml` **ne déclare pas** `packages:`. Le fragment
`config/packages/home_stock_intents.yaml` est déposé et **n'est pas chargé**.
Le fragment de `home-desk` subira le même sort tant que la ligne manque.

*Conséquence non négociable sur l'ordre* : le mode de panne est ici plus grave
que chez `home-stock`. Là-bas, l'oubli rendait sept phrases reconnues sans
gestionnaire ; ici, retirer les sept blocs d'`automations.yaml` avant que le
fragment ne soit **effectivement chargé** laisse une maison vivante avec trois
écrans allumés en permanence, sans garde thermique. Donc, dans cet ordre et
jamais l'inverse : déposer le fragment → **constater dans Home Assistant que
les sept automations sont chargées** → seulement alors retirer les sept blocs
d'`automations.yaml`.

*Coût si c'est faux* : les sept automations citent des entités extérieures aux
tablettes (présence au lit, lumières, éclairement). Une réécriture qui en perd
une dégrade une logique de la maison, pas seulement un écran.

*Renversement* : **cher**. C'est une vraie réécriture, plus un retrait dans
`automations.yaml`. À rouvrir avant la tâche qui l'exécute.

### 7. Les trois `bleuenn_url_*` : **révoqués et retirés**, après relevé

*Motif* : trois JWT de longue durée (`exp` 2089) qui ouvrent Home Assistant
sans consommateur mesuré sont une exposition permanente. Un jeton qui n'ouvre
plus rien reste un jeton valide.

*Le risque nommé* : la `startUrl` de Fully vit **sur l'appareil**, pas dans Home
Assistant. Le plan **relève donc la `startUrl` des trois Fire 7 avant toute
révocation**, en une étape explicite. Si une tablette emploie encore la chaîne
de redirection par le port 8124, la corriger est un réglage d'appareil — bon
marché, et ce n'est pas une raison de garder trois jetons vivants.

*Coût si c'est faux* : sans le relevé, une tablette afficherait une page
d'erreur au prochain redémarrage. Le relevé est ce qui rend ce coût nul.

*Renversement* : **impossible** — une révocation ne se défait pas ; on émet un
nouveau jeton. C'est la seule décision irréversible de la liste, et c'est
pourquoi elle est précédée d'un relevé et exécutée en dernier.

### 8. `requires.packages` : **`[home-manager]` seul**

*Motif* : la dépendance à `home_stock` passe par le bus — 3 entités et 3
commandes websocket — et **jamais par un import**. C'est une dépendance
d'exécution, pas d'installation ; `requires` exprime le dur. Forcer le
garde-manger imposerait un coût à chaque installation des tablettes du salon et
du bureau, qui n'en ont aucun besoin.

*Le défaut de ce choix est le SILENCE, pas l'absence*, et il est mesuré :
`app/src/pieces.ts` (l. 402-405) documente que la tuile « Recette » s'appuie
sur « le masquage générique de `rendu/corps.ts` » — `home_stock` non chargé ⇒
le capteur passe `unavailable` ⇒ **la tuile disparaît**. Un écran de cuisine
d'où une fonction s'évapore sans un mot est un défaut, pas une dégradation
propre.

*Correction portée par une tâche à part entière* : là où vivent la ligne
« repas suivant » et la vue « Recette », l'écran de la cuisine affiche un état
**nommé** — « garde-manger non installé » — jamais un vide.

*Coût si c'est faux* : nul pour l'installation existante, où les deux packages
cohabitent.

*Renversement* : **bon marché** — une ligne dans le manifeste.

### 9. Le générateur `tools/wallpanel/` : **archivé** avec ses dashboards, une fois son chantier clos

*Motif* : le laisser en place le fait continuer de ressembler à du code vivant
— c'est exactement le piège que cette spec décrit, deux générations qui
cohabitent dont une morte qui a l'air vivante. Le faire entrer dans `home-desk`
lui ferait porter 2 819 lignes qu'il n'exécute jamais.

*Le coût de l'archivage* — le filet de retour arrière du 2026-08-02 devient
plus dur à actionner — **tombe si la procédure d'actionnement est écrite** :
l'archive porte un `README.md` disant quoi restaurer, où, et dans quel ordre.

*Mesure qui contraint le calendrier, et non la décision* : `rooms.py` a été
modifié le **2026-09-04 à 08:37** par la Task 12 du chantier music-assistant, et
porte deux sauvegardes datées du même jour. Ce répertoire n'est pas de la
matière dormante : c'est un **chantier d'autrui en cours**. L'archiver
maintenant casserait un plan en vol. L'archivage est donc **la dernière tâche
du plan, explicitement conditionnée** à la clôture du chantier music-assistant
(sa Task 13).

*Coût si c'est faux* : si la génération 1 devait un jour reprendre du service,
l'archive la rend plus lente à réveiller — d'où le `README.md`.

*Renversement* : **bon marché** tant que l'archive est un déplacement, pas une
suppression. Elle l'est.

### 10. L'arbre de travail : **le packaging démarre maintenant, sur l'état qui tourne**

Le premier commit du dépôt neuf est **exactement ce qui tourne sur les trois
tablettes**, parce que c'est le seul état vérifié — et il l'est : le bundle
déployé du 2026-09-04 01:01, portant `musique_*` et zéro `ytube`.

**Correction apportée par la mesure.** Le tri envisagé au 2026-08-29 excluait de
l'import cinq fichiers réputés appartenir au chantier film — `src/demarrage.ts`,
`src/media.ts`, `src/rendu/corps.ts`, `src/rendu/modes.ts`,
`src/styles/base.css`. Deux mesures du 2026-09-04 le contredisent :

1. `git diff --name-only mouvement-grammaire mouvement-film` ne rend **aucun
   fichier de `src/`**. Le chantier film est de l'**outillage seul**
   (`outils/film/*`, `tests/film-detecteurs.test.mjs`). Ces cinq fichiers ne
   lui appartiennent pas : ce sont des modifications non commitées de
   `mouvement-grammaire`.
2. Leurs `mtime` s'échelonnent du 25 au 29 août ; **le bundle en production a
   été construit le 4 septembre à 01:01**, après la dernière d'entre elles. Ces
   cinq fichiers **sont donc dans le bundle qui tourne**.

Les exclure produirait un dépôt dont `dist/` ne correspond à aucun `src/` — la
contradiction exacte que `test_dist_a_jour` doit interdire. Le critère porteur
(« le premier commit est l'état vérifié ») l'emporte donc sur une répartition
qui reposait sur une hypothèse mesurément fausse.

**Ce que l'import emporte**, et le message du commit le nomme, dates de mesure
comprises :

| Entre | Nature | Mesure |
|---|---|---|
| L'état commité de `mouvement-grammaire` | 91 commits aplatis en un | HEAD `a9284b3`, 2026-08-26 |
| La bascule Music Assistant | `src/pieces.ts` + 3 fichiers de tests | 2026-09-04 00:59-01:00, en production |
| La réparation des chemins de build | `rollup.config.js`, `scripts/copier-assets.mjs`, `scripts/versionner.mjs`, `outils/verifier-rendu.mjs` | 2026-08-29 20:19, à moitié faite |
| Le travail non commité sur `mouvement-grammaire` | 5 fichiers de `src/`, 8 de `tests/`, `README.md` | 2026-08-25 au 2026-08-29, **dans le bundle en production** |
| Les 9 `docs/superpowers/` du dépôt d'origine | le raisonnement que l'aplatissement perd | — |

**Ce que l'import n'emporte pas** :

| N'entre pas | Pourquoi |
|---|---|
| Le chantier film (`outils/film/*`, `tests/film-detecteurs.test.mjs`, branche `mouvement-film`, worktree `wallpanel-film`) | Outillage de vérification en cours, jamais exécuté en production. Il reste à son chantier de le clore, dans l'ancien arbre |
| Les 4 fichiers `*.backup-music-assistant-20260904` | Des sauvegardes, pas des sources |
| `node_modules/` (115 Mo), `.superpowers/` | Déjà exclus par le `.gitignore` d'origine |
| Les 5 autres branches (`principal`, `moteur-mouvement`, `lot-6-garde-manger`, `recette-repas-suivant`) | Toutes ancêtres de `mouvement-grammaire` ou de son histoire ; l'aplatissement les contient |

*Coût si c'est faux* : si le chantier film devait fusionner plus tard, ses 20
commits d'outillage sont à réimporter à la main dans `home-desk`. C'est de
l'outillage, il ne bloque aucune tablette.

*Renversement* : **cher** au même titre que la décision 1 — c'est le contenu du
premier commit.

---

## Les décisions dont le renversement est cher

Trois, et trois seulement. Les rouvrir a un sens **avant** la tâche qui les
exécute ; après, elles se paient.

| # | Décision | À rouvrir avant | Prix après |
|---|---|---|---|
| 1 + 10 | Dépôt neuf, et contenu du premier commit | Task 1 | réécriture d'historique |
| 6 | Les 7 automations réécrites en fragment | Task 8 | une réécriture, plus un retrait dans `automations.yaml` |
| 7 | Révocation des trois JWT | Task 11 | **irréversible** — on n'annule pas une révocation, on réémet |

Les sept autres se renversent pour le prix d'une ligne de manifeste, d'un
déplacement d'arbre ou d'un commentaire.

---

## Ordre de réalisation retenu

```
Task 1  dépôt neuf + import trié (le commit qui nomme ce qu'il emporte)
  └─ Task 2  build portable : dist/ relatif, 3 pages générées, chemins absolus purgés
       │      ══ PORTE : le rebuild doit reproduire le bundle du 4 sept. 01:01 ══
       ├─ Task 3  manifeste, Makefile, test_manifest_contract
       │    └─ Task 4  hooks/install.py, test_install_hook, test_dist_portable
       ├─ Task 5  vignette importé, son manifest.json corrigé
       ├─ Task 6  l'état nommé « garde-manger non installé » (décision 8)
       └─ Task 7  les 7 automations réécrites en packages/home_desk.yaml
            └─ Task 8  ══ PORTE : fragment chargé AVANT tout retrait ══
                 └─ Task 9  README, CLAUDE.md — la portée et les gestes opérateur
                      └─ Task 10  bascule en production, contrôle sur les 3 tablettes
                           ├─ Task 11  relevé des startUrl, puis révocation des 3 JWT
                           └─ Task 12  dette du socle + archivage de la génération 1
                                       (conditionné à la clôture de music-assistant)
```

Deux portes, pour deux raisons différentes.

**La Task 2 est une porte de fidélité.** Tant que le rebuild ne reproduit pas
le bundle en production, l'import n'est pas prouvé fidèle et rien de ce qui
suit n'a de fondation.

**La Task 8 est une porte de sûreté.** Tout ce qui la précède laisse la maison
intacte ; le retrait des sept blocs d'`automations.yaml` est le premier geste
qui peut dégrader une maison vivante, et il ne se fait qu'après avoir constaté
le fragment chargé.

Le chantier `requires.packages` n'apparaît nulle part : il est fait, et
`home-desk` en est le cas d'école nommé.
