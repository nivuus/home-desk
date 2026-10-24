# Tablettes murales (`home-desk`)

L'application dédiée qui tourne sur les trois tablettes Fire 7 de la maison —
salon, bureau, cuisine. TypeScript + `lit`, construite par rollup, servie par
Home Assistant depuis `config/www/wallpanel/`.

## ⚠️ Ce package est propre à UNE maison

Ce n'est pas une base paramétrable, et ce n'est pas un oubli.

- `app/src/` cite **66 `entity_id` en dur**, répartis en 18 domaines.
- `app/src/ecran.ts` déclare `ECRANS: Record<'salon' | 'bureau' | 'cuisine', Ecran>` —
  les trois pièces sont un **type TypeScript**, pas une donnée de configuration.

Installé ailleurs, il affiche un écran d'entités inexistantes. La
paramétrisation coûterait une refonte de `ecran.ts`, `modes.ts` et des 41
fichiers de tests, pour zéro bénéfice sur l'unique installation existante
(décision 4 de la spec).

**La couture est nommée** : `app/src/ecran.ts` est le point **unique** où la
maison entre dans l'application. Le jour où une deuxième maison existe, c'est
le seul fichier à ouvrir.

> **En cours de renversement.** La spec du 2026-09-12
> (`docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`)
> annule cette décision : la donnée part chez Home Assistant, le type reste ici.
> Ce plan-ci (1/3) ne déplace encore aucune donnée.

## Configuration des écrans depuis Home Assistant (`custom_components/home_desk`)

Une intégration Home Assistant, une entrée « Tablettes murales », **une
sous-entrée par écran** : ajouter une quatrième tablette est la même
opération que pour les trois premières. Se configure entièrement depuis
l'interface (`config_flow.py`) ; un écran devenu invalide ne peut pas être
enregistré (`garde_ecran.py`). Deux commandes websocket
(`home_desk/ecran`, `home_desk/ecrans`) et un événement de bus
(`home_desk_config_changed`) publient la configuration vers `app/src/`.

### `home_desk.exporter` / `home_desk.importer`

Les `note` du contrat (le raisonnement derrière un choix — pourquoi une
porte est épinglée, pourquoi un mode existe) vivent dans `.storage`, hors de
git. Deux services les font voyager vers un fichier versionnable,
`config/home_desk_ecrans.yaml` :

- **`home_desk.exporter`** écrit tous les écrans actuels dans ce fichier —
  les `note` y redeviennent des **commentaires** (`# ...`), jamais des
  champs : un `note: "..."` au milieu des données serait une chaîne de
  plus, un `#` au-dessus de ce qu'il justifie est ce qu'un humain relit
  dans un `git log`.
- **`home_desk.importer`** relit ce fichier et **remplace** l'intégralité
  des écrans configurés par son contenu. **Atomique** : tous les écrans du
  fichier sont validés avant qu'un seul ne soit écrit — un import partiel
  laisserait la configuration dans un état que personne n'a voulu.
  `importer` n'accepte que les fichiers de **version 2** : un écran qui
  porte une autre `version`, ou encore une forme de la version 1, refuse
  l'import entier (un écran sans `version` est pris pour la version 2).
  Ce n'est pas un chemin de migration : les écrans déjà enregistrés en
  version 1 sont réécrits en version 2 **au chargement** de l'intégration
  (`migration.py`), sans passer par lui.

### `home_desk.jouer_animation`

Joue une vidéo, une image animée ou une animation Lottie par-dessus l'écran
des tablettes nommées, puis rend la main à l'écran. Ouvert aux
non-administrateurs : il est fait pour les automations et les tableaux de
bord de la maison, et n'écrit rien.

- **`ecrans`** — les noms des écrans, **exacts, majuscules comprises** :
  `Salon` n'est pas `salon`. Un seul nom inconnu refuse l'appel entier.
- **`media`** — un identifiant `media-source://...`, ce que produit le
  sélecteur de média de Home Assistant.
- **`duree`** — en secondes, **120 au plus**, envoyée à la milliseconde.
  Sans elle, une vidéo ou un Lottie joue une fois jusqu'à sa fin ; une
  **image animée l'exige** (elle n'a pas de fin détectable).
- **`fond`** — `noir` (par défaut) ou `transparent`.

Tout est vérifié **avant** le moindre envoi : écran inconnu, fichier absent,
type illisible, durée hors bornes, et rien ne part. L'animation n'est pas
mise en file : une tablette **hors ligne** au moment de l'appel ne la
rejouera **jamais** en revenant.

```yaml
action: home_desk.jouer_animation
data:
  ecrans: [Salon]
  media:
    media_content_id: media-source://media_source/local/animations/sonnette.lottie
    media_content_type: application/zip+dotlottie
  duree: 8
  fond: transparent
```

**Limite : les fichiers Lottie ne passent pas par l'interface.** Le
navigateur de médias et l'envoi de fichiers de Home Assistant ne
connaissent que l'audio, la vidéo et l'image : un `.json` ou un `.lottie`
n'y est ni proposé ni téléversable. Il faut le **copier à la main** dans le
dossier de médias (la source `local`, `config/media/` par défaut), puis le nommer
dans le YAML par son identifiant
`media-source://media_source/local/<chemin>` — le sélecteur de l'éditeur
d'actions ne le trouvera pas.

### Ce que ça coûte — les régressions nommées, franchement

1. **Une installation neuve n'affiche plus rien** tant qu'on n'a pas
   configuré au moins un écran. C'est le prix direct de la portabilité.
2. **La configuration n'est plus versionnée par défaut.** Elle vit dans
   `.storage`, donc dans les sauvegardes HA. `home_desk.exporter` le
   rattrape à la demande, pas automatiquement.
3. **Le raisonnement quitte le dépôt.** Les `note` sont sauvegardées avec
   HA, pas avec git ; un `git log` ne raconte plus pourquoi « Porte » est
   épinglée, tant que personne n'a exporté.
4. **Un aller-retour réseau s'ajoute au démarrage** (les deux commandes
   websocket), là où le bundle affichait immédiatement.
5. **Une dépendance de test lourde entre**
   (`pytest-homeassistant-custom-component`), qui épingle une version de
   HA et qu'il faudra suivre — voir `make test-composant` ci-dessous.

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
npm test             # 47 fichiers vitest, 1048 tests
cd .. && make test            # les 5 scripts du package (python3 + PyYAML)
make test-composant           # custom_components/home_desk (pytest + Home Assistant, voir ci-dessus)
```

Trois suites, trois raisons d'être — `make test` doit rester lançable sur la
cible d'installation (aucune dépendance hors `python3` + PyYAML), `make
test-app` couvre l'application TypeScript, `make test-composant` couvre
l'intégration Home Assistant et tire une dépendance lourde (régression n°5
ci-dessus) : les mélanger rendrait le package intestable partout où l'une
des trois n'est pas disponible.

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
