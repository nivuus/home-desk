# Package Nivuus `home-desk` — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de l'affichage des trois tablettes murales un package Nivuus satellite de `home-manager`, installable depuis le wizard — deuxième satellite après `home-stock`, troisième package de la suite.

**Architecture:** Un **dépôt neuf** reçoit en un commit l'application TypeScript qui tourne aujourd'hui sur les trois Fire 7. Le build devient relatif au dépôt et écrit un `dist/` **suivi par git** ; un `hooks/install.py` calqué sur celui de `home-stock` dépose trois choses dans la configuration créée par le socle — le bundle dans `www/wallpanel/`, le composant `vignette` dans `custom_components/`, et un fragment d'automations dans le répertoire partagé `packages/`. Aucun hook `activate` : le tri topologique de `requires.packages` place l'installation du satellite avant que le socle ne démarre Home Assistant.

**Tech Stack:** TypeScript + `lit` + rollup + vitest pour l'application ; Python 3.11 (stdlib + PyYAML) pour le hook et ses tests, en scripts autonomes lancés par `make test`.

**Spec:** `docs/superpowers/specs/2026-08-29-package-nivuus-home-desk-design.md` — inventaire du 2026-08-29, corrections de mesure et dix décisions du 2026-09-04.

## Global Constraints

- **Trois arbres distincts**, à ne jamais confondre :
  - `REPO` = `/home/mallanic/Projects/Nivuus/packages/home-desk` (le package, à créer)
  - `SOURCE` = `/opt/nivuus/HomeAssistant/data/tools/wallpanel-app` (le dépôt d'origine, **lecture seule** dans ce plan)
  - `DEPLOY` = `/opt/nivuus/home-manager/config` (production, root, **données d'une maison vivante**)
- **Tout accès à `SOURCE` et `DEPLOY` passe par `sudo -n`** (root, `drwxr-x---`).
- **Répertoire de dépôt du hook** : `{root}/opt/nivuus/home-manager/config` — créé par le socle, **jamais** par ce package. Le hook refuse s'il est absent.
- **Le hook n'écrit JAMAIS dans `configuration.yaml`.** Il signale les deux lignes dues, avec leur texte exact. Règle posée par le `PRESERVED` de `home-manager/hooks/install.py` et reprise par `home-stock`.
- **Deux destinations sont des répertoires PARTAGÉS** : `config/www/` (onze occupants mesurés le 2026-09-04) et `config/packages/` (`home_stock_intents.yaml` y vit déjà). Le hook n'y remplace jamais un répertoire — il remplace `www/wallpanel/` seul, et **copie** le fichier `packages/home_desk.yaml`.
- **Seuls les fichiers suivis par git voyagent** (`git archive HEAD` dans `iso-build/build.sh`). C'est ce qui impose `dist/` versionné.
- **`tier: userspace`** : ni `platform:`, ni `claims:`, ni `apt:`, ni `wizard.yaml`, ni hook `activate`.
- **Sauvegarde datée avant chaque écriture dans `DEPLOY`**, convention du dépôt : `<fichier>.backup-home-desk-20260904`.
- **Tests du package** : `python3` + PyYAML seulement, pas de pytest — c'est le style du dépôt `installer`. Les 43 fichiers vitest de l'application gardent leur propre cible `make test-app`, qui exige Node.
- **Ce package est propre à cette maison** (décision 4) : 66 `entity_id` en dur, trois pièces déclarées comme un **type** TypeScript. Aucune tâche de ce plan n'ajoute d'`entity_id` en dur ailleurs que dans `app/src/pieces.ts`.
- **Deux portes**, à ne franchir que sur constat : la Task 2 (fidélité de l'import) et la Task 10 (fragment chargé avant tout retrait).

---

## Les dix décisions, et la tâche qui les exécute

La spec porte le motif de chaque décision et ce qu'elle coûte si elle s'avère
fausse. Cette table dit **où** chacune se joue — pour qu'une décision qu'on
veut rouvrir se rouvre avant sa tâche, jamais après.

| # | Décision | Tâche | Renversement |
|---|---|---|---|
| 1 | Dépôt **neuf**, import en un commit | Task 1 | **cher** — réécriture d'historique |
| 2 | Bundle **versionné** dans `dist/` | Task 2 | modéré |
| 3 | `wallpanel.jinja` + 5 capteurs **restent au socle**, datés sur place | Task 12 (1-3) | bon marché |
| 4 | Package **propre à cette maison**, assumé | Task 4 (`label`), Task 8 (README) | bon marché |
| 5 | `vignette` **part** avec `home-desk` | Task 5 | bon marché |
| 6 | Les 7 automations **réécrites en fragment** | Task 6 (écrire), Task 10 (basculer) | **cher** — réécriture + retrait |
| 7 | Les 3 JWT **révoqués**, après relevé | Task 11 | **IRRÉVERSIBLE** |
| 8 | `requires.packages` = `[home-manager]` **seul** | Task 4 (manifeste), Task 3 (le silence corrigé) | bon marché |
| 9 | Générateur `tools/wallpanel/` **archivé** | Task 12 (4-6), conditionnée | bon marché |
| 10 | Packaging **maintenant**, sur l'état qui tourne | Task 1 | **cher** — c'est le premier commit |

Quatre décisions se paient après coup : 1, 6, 7 et 10. Les six autres se
renversent pour le prix d'une ligne de manifeste, d'un déplacement d'arbre ou
d'un commentaire.

**Une correction de la spec porte sur la décision 10**, et elle vient d'une
mesure : le tri envisagé au 2026-08-29 excluait de l'import cinq fichiers
réputés appartenir au chantier film. Or `git diff --name-only
mouvement-grammaire mouvement-film` ne rend **aucun fichier de `src/`** — le
chantier film est de l'outillage seul — et les `mtime` de ces cinq fichiers
(25 au 29 août) **précèdent le build en production du 4 septembre 01:01**. Ils
sont donc dans le bundle qui tourne. Les exclure produirait un dépôt dont
`dist/` ne correspond à aucun `src/`. Le critère porteur — « le premier commit
est l'état vérifié » — l'emporte, et la Task 1 Step 2 le revérifie avant de
copier quoi que ce soit.

---

## Structure de fichiers visée

```
packages/home-desk/
├── nivuus-package.yaml          manifeste, requires.packages: [home-manager]
├── Makefile                     cibles `test` (package) et `test-app` (vitest)
├── README.md                    portée « cette maison », gestes opérateur
├── CLAUDE.md                    décisions à ne pas défaire
├── .gitignore                   node_modules/, .superpowers/, __pycache__/
├── app/                         l'application (ex-`tools/wallpanel-app`)
│   ├── src/  (44 fichiers)      pieces.ts EST la seule couture vers cette maison
│   ├── tests/ (43 fichiers)     vitest
│   ├── assets/ (5 fichiers)     polices DSEG, eclair.webp, 2 .webm
│   ├── scripts/                 generer-jetons, copier-assets, versionner, generer-pages
│   ├── gabarits/piece.html      NOUVEAU — le patron des trois pages d'entrée
│   ├── outils/                  verifier-rendu, mesurer-*
│   ├── docs/superpowers/        les 9 fichiers du dépôt d'origine
│   └── package.json, rollup.config.js, tsconfig.json, vitest.config.ts
├── dist/                        SUIVI PAR GIT — ce que le hook dépose
│   ├── wallpanel.js, wallpanel.css
│   ├── salon.html, bureau.html, cuisine.html   (générées)
│   └── assets/                  copiées depuis app/assets/ par le build
├── custom_components/vignette/  __init__.py, manifest.json
├── packages/home_desk.yaml      les 7 automations « Tablettes »
├── hooks/install.py
├── tests/                       scripts autonomes python3 + PyYAML
│   ├── test_manifest_contract.py
│   ├── test_install_hook.py
│   ├── test_dist_portable.py
│   └── test_dist_a_jour.py
└── docs/superpowers/{specs,plans}/
```

**Pourquoi `app/` et non la racine.** `home-stock` range son frontend sous `frontend/` et garde sa matière de package à la racine. Le même partage est repris ici, et il résout une collision : `app/tests/` porte les 43 fichiers vitest, `tests/` les scripts Python du package. Tous les chemins internes de l'application sont relatifs — seuls les trois chemins de sortie absolus changent, et la Task 2 les change de toute façon.

---

### Task 1 : le dépôt neuf et l'import trié

Le premier commit doit être **exactement ce qui tourne sur les trois tablettes** : c'est le seul état vérifié. Le message du commit nomme ce qu'il emporte et ce qu'il laisse, avec les dates de mesure — un import qui avale trois chantiers sans le dire serait un piège pour la prochaine session.

**Files:**
- Create: `REPO/.git` (dépôt neuf), `REPO/.gitignore`
- Create: `REPO/app/**` (importé de `SOURCE`), `REPO/docs/superpowers/{specs,plans}/`

**Interfaces:**
- Consumes: rien.
- Produces: un arbre de travail portant ~115 fichiers sous `app/`, dont `app/src/pieces.ts` avec 36 références `musique_*` et zéro `ytube`.

- [x] **Step 1: Relever l'état de la source avant de la copier**

```bash
S=/opt/nivuus/HomeAssistant/data/tools/wallpanel-app
echo "branche : $(sudo -n git -C $S rev-parse --abbrev-ref HEAD)"
echo "HEAD    : $(sudo -n git -C $S rev-parse --short HEAD)"
echo "modifies: $(sudo -n git -C $S status --short | grep -c '^ M')"
echo "suivis  : $(sudo -n git -C $S ls-files | wc -l)"
```
Expected: `mouvement-grammaire`, `a9284b3`, `23`, `115`.

Si `HEAD` diffère de `a9284b3`, **arrêter le plan** : la source a bougé depuis la mesure du 2026-09-04, et l'import ne serait plus celui que la spec décrit.

- [x] **Step 2: Vérifier que la source est bien celle qui tourne**

C'est le contrôle qui justifie d'importer l'arbre sale entier plutôt qu'un tri.

```bash
S=/opt/nivuus/HomeAssistant/data/tools/wallpanel-app
echo -n "derniere modif source : "
for f in $(sudo -n git -C $S status --short | awk '$1=="M"{print $2}'); do sudo -n stat -c '%Y' $S/$f; done | sort -n | tail -1
echo -n "build deploye         : "
sudo -n stat -c '%Y' /opt/nivuus/home-manager/config/www/wallpanel/wallpanel.js
```
Expected: le second nombre est **supérieur** au premier (mesuré : 01:00:16 contre 01:01:14 le 2026-09-04).

Si le build était antérieur à la dernière modification, **arrêter le plan** : l'arbre porterait du travail non déployé et la décision 10 serait à rouvrir.

- [x] **Step 3: Créer le dépôt et son `.gitignore`**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
git init -b main
```

Créer `.gitignore` :
```
node_modules/
.superpowers/
__pycache__/
*.pyc
```

- [x] **Step 4: Importer l'application, sans les sauvegardes ni `node_modules`**

`--exclude` porte exactement ce que la décision 10 laisse dehors.

```bash
S=/opt/nivuus/HomeAssistant/data/tools/wallpanel-app
R=/home/mallanic/Projects/Nivuus/packages/home-desk
mkdir -p $R/app
sudo -n rsync -a \
  --exclude '.git' --exclude '.git/' \
  --exclude 'node_modules/' --exclude '.superpowers/' \
  --exclude '*.backup-music-assistant-20260904' \
  --exclude 'outils/film/' --exclude 'tests/film-detecteurs.test.mjs' \
  $S/ $R/app/
sudo -n chown -R "$(id -un):$(id -gn)" $R/app
```

`outils/film/` et `tests/film-detecteurs.test.mjs` sont exclus par prudence : ils vivent sur la branche `mouvement-film`, donc ils ne devraient pas être dans cet arbre. Les exclure coûte une ligne et garantit le résultat.

- [x] **Step 5: Vérifier ce que l'import a emporté**

```bash
R=/home/mallanic/Projects/Nivuus/packages/home-desk
echo "musique_ dans pieces.ts : $(grep -c 'musique_' $R/app/src/pieces.ts)"
echo "ytube dans pieces.ts    : $(grep -c 'ytube' $R/app/src/pieces.ts || echo 0)"
echo "sauvegardes importees   : $(find $R/app -name '*.backup-*' | wc -l)"
echo "node_modules importe    : $(test -d $R/app/node_modules && echo OUI || echo non)"
echo "chantier film importe   : $(test -e $R/app/outils/film && echo OUI || echo non)"
echo "docs du depot d'origine : $(find $R/app/docs/superpowers -type f | wc -l)"
```
Expected: `36`, `0`, `0`, `non`, `non`, `9`.

- [x] **Step 6: Déplacer la spec sous le dépôt et committer l'import**

La spec est déjà à sa place (`docs/superpowers/specs/`) et ce plan aussi. Le commit d'import les emporte.

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
git add -A
git commit -F - <<'MSG'
import: l'application des trois tablettes, dans l'etat qui tourne

Depot NEUF (decision 1). Les 91 commits de tools/wallpanel-app ne sont pas
repris : ce depot n'avait aucun remote, son historique n'etait partage avec
personne. Il reste consultable en place.

Ce commit est EXACTEMENT ce qui tourne sur les trois Fire 7 au 2026-09-04.
Verification : la derniere modification de la source date de 01:00:16, le
bundle deploye de 01:01:14 — le build est posterieur a tout.

CE QUE CET IMPORT EMPORTE, et qui melange trois chantiers :

  1. L'etat commite de `mouvement-grammaire` (HEAD a9284b3, 2026-08-26),
     91 commits aplatis en un seul.
  2. La bascule Music Assistant : src/pieces.ts et trois fichiers de tests,
     modifies le 2026-09-04 entre 00:59 et 01:00. C'est la Task 11 du plan
     home-manager/docs/superpowers/plans/2026-09-03-music-assistant.md, deja
     executee et deja en production. 36 references `musique_*`, zero `ytube`.
  3. La reparation des chemins de sortie du build (rollup.config.js,
     scripts/copier-assets.mjs, scripts/versionner.mjs, outils/verifier-rendu.mjs),
     2026-08-29 20:19 — a moitie faite : le chemin pointe desormais vers
     /opt/nivuus/home-manager/config mais reste absolu et hors depot. La
     Task 2 de ce plan la termine.
  4. Du travail non commite sur `mouvement-grammaire` : 5 fichiers de src/,
     8 de tests/, README.md, dates du 2026-08-25 au 2026-08-29. Tous
     ANTERIEURS au build en production, donc tous dedans.

CE QUE CET IMPORT LAISSE :

  - Le chantier film (outils/film/*, tests/film-detecteurs.test.mjs, branche
    `mouvement-film`, worktree wallpanel-film). Mesure du 2026-09-04 :
    `git diff --name-only mouvement-grammaire mouvement-film` ne rend AUCUN
    fichier de src/. C'est de l'outillage de verification en cours, jamais
    execute en production. Il reste a son chantier de le clore.
  - Les 4 sauvegardes *.backup-music-assistant-20260904 : des sauvegardes,
    pas des sources.
  - node_modules/ (115 Mo) et .superpowers/.

Spec : docs/superpowers/specs/2026-08-29-package-nivuus-home-desk-design.md
Plan : docs/superpowers/plans/2026-09-04-package-home-desk.md
MSG
```

---

### Task 2 : le build portable, et la preuve que l'import est fidèle — **PORTE**

Trois défauts mesurés se corrigent ensemble, parce qu'ils ont la même cause : le build a été écrit pour déployer, pas pour construire. Sa sortie est hors du dépôt, les trois pages d'entrée ne sont versionnées nulle part, et cinq chemins absolus survivent dans le code suivi.

**La porte** : à la fin de cette tâche, `npm run build` doit reproduire **à l'octet près** le bundle qui tourne en production. Tant que ce n'est pas constaté, l'import n'est pas prouvé fidèle et rien de ce qui suit n'a de fondation.

**Files:**
- Modify: `app/rollup.config.js`, `app/scripts/copier-assets.mjs`, `app/scripts/versionner.mjs`, `app/outils/verifier-rendu.mjs`, `app/package.json`
- Create: `app/gabarits/piece.html`, `app/scripts/generer-pages.mjs`
- Create: `dist/` (produit par le build, puis suivi par git)

**Interfaces:**
- Consumes: l'arbre importé (Task 1).
- Produces: `REPO/dist/` complet — `wallpanel.js`, `wallpanel.css`, `salon.html`, `bureau.html`, `cuisine.html`, `assets/` (5 fichiers). C'est la source unique du dépôt de la Task 7.

- [x] **Step 1: Relever l'empreinte de référence, avant de toucher à quoi que ce soit**

```bash
D=/opt/nivuus/home-manager/config/www/wallpanel
sudo -n sha256sum $D/wallpanel.js $D/wallpanel.css
sudo -n stat -c '%s %n' $D/wallpanel.js $D/wallpanel.css
sudo -n grep -o 'v=[0-9a-f]*' $D/salon.html | head -1
```
Expected: `wallpanel.js` 108645 octets, `wallpanel.css` 88292 octets, `v=2a9ebf2b39`. **Noter les deux sha256** — ce sont les valeurs que le Step 9 doit retrouver.

- [x] **Step 2: Écrire le test qui échoue**

Créer `tests/test_dist_portable.py` :

```python
#!/usr/bin/env python3
"""dist/ est suivi par git, complet, et ne porte aucun chemin de machine.

C'est le corollaire de la decision 2 : le bundle est versionne, donc
`git archive HEAD` l'emporte et l'installateur n'a jamais besoin de Node.
Un dist/ non suivi ferait echouer l'installation en silence — le hook
deposerait un repertoire vide.

Transposition de test_compose_portable.py du package home-manager.

Run: python3 tests/test_dist_portable.py
"""
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]

# Les cinq artefacts que le hook depose. assets/ est duplique depuis
# app/assets/ par le build : c'est 411 Ko payes une fois (git stocke par
# contenu) pour que dist/ soit COMPLET, donc deposable par un seul
# replace_tree() atomique — le repertoire est relu par trois clients qui
# rechargent tout seuls.
ATTENDUS = (
    "wallpanel.js", "wallpanel.css",
    "salon.html", "bureau.html", "cuisine.html",
)

# Aucun chemin de machine ne doit survivre dans ce qui est depose.
# /opt/nivuus/HomeAssistant est l'ancien emplacement, disparu le 2026-08-28.
INTERDITS = ("/opt/nivuus/HomeAssistant", "/home/mallanic")

failures = []


def suivis(sous_repertoire):
    out = subprocess.run(["git", "-C", str(REPO), "ls-files", sous_repertoire],
                         capture_output=True, text=True, check=True)
    return [l for l in out.stdout.splitlines() if l]


fichiers = suivis("dist")
if not fichiers:
    failures.append("dist/ n'est suivi par AUCUN fichier : "
                    "git archive HEAD n'emporterait rien")

noms = {pathlib.PurePosixPath(f).name for f in fichiers}
for attendu in ATTENDUS:
    if attendu not in noms:
        failures.append(f"dist/{attendu} n'est pas suivi par git")

if not any(f.startswith("dist/assets/") for f in fichiers):
    failures.append("dist/assets/ n'est suivi par aucun fichier ; "
                    "les polices DSEG et les deux videos manqueraient")

# Les binaires ne se relisent pas en texte : on ne scanne que le texte.
for rel in fichiers:
    chemin = REPO / rel
    if chemin.suffix not in (".js", ".css", ".html"):
        continue
    texte = chemin.read_text(encoding="utf-8", errors="replace")
    for interdit in INTERDITS:
        if interdit in texte:
            failures.append(f"{rel} porte le chemin de machine {interdit}")

# Le code SUIVI de l'application ne doit plus citer l'ancien emplacement.
for rel in suivis("app"):
    chemin = REPO / rel
    if chemin.suffix not in (".js", ".mjs", ".ts", ".json"):
        continue
    texte = chemin.read_text(encoding="utf-8", errors="replace")
    if "/opt/nivuus/HomeAssistant" in texte:
        failures.append(f"{rel} cite encore /opt/nivuus/HomeAssistant, "
                        "emplacement disparu le 2026-08-28")

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_dist_portable: OK")
```

- [x] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `python3 tests/test_dist_portable.py`
Expected: FAIL — `dist/ n'est suivi par AUCUN fichier`, plus les lignes citant `/opt/nivuus/HomeAssistant` dans `app/outils/verifier-rendu.mjs`.

- [x] **Step 4: Rendre la sortie du build relative au dépôt**

Dans `app/rollup.config.js`, remplacer le bloc `output.dir` :

```js
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// La sortie est RELATIVE au depot (decision 2 de la spec) : `dist/` est suivi
// par git, donc `git archive HEAD` l'emporte et l'installateur n'a jamais
// besoin de Node. Avant le 2026-09-04 ce chemin etait absolu et pointait vers
// un repertoire de production — un build ne pouvait donc pas se faire ailleurs
// que sur la machine de son auteur, et le contrat nivuus.dev/v1 ne pouvait pas
// livrer le bundle.
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RACINE, 'dist');

export default {
  input: 'src/index.ts',
  output: {
    dir: DIST,
    entryFileNames: 'wallpanel.js',
    format: 'iife', name: 'Wallpanel', sourcemap: false,
  },
  // ... le reste du fichier inchange
};
```

- [x] **Step 5: Rendre `copier-assets.mjs` et `versionner.mjs` relatifs**

Dans `app/scripts/copier-assets.mjs`, remplacer la ligne `SORTIE` :

```js
// Meme raison que rollup.config.js : la sortie est relative au depot. Les cinq
// fichiers d'assets (411 Ko, inchanges depuis le 2026-08-21) sont DUPLIQUES
// dans dist/ a dessein — c'est ce qui rend dist/ complet, donc deposable par
// un seul replace_tree() atomique. Le repertoire est relu par trois clients
// qui rechargent tout seuls ; deux gestes de depot y ouvriraient une fenetre.
const SORTIE = join(ICI, '..', '..', 'dist', 'assets');
```

Dans `app/scripts/versionner.mjs`, la même substitution :

```js
const SORTIE = join(ICI, '..', '..', 'dist');
```

`versionner.mjs` n'avait pas de constante `ICI` : l'ajouter en tête, sur le modèle de `copier-assets.mjs` —

```js
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
```

- [x] **Step 6: Créer le gabarit des trois pages d'entrée**

Les trois `<piece>.html` sont **le point d'entrée réel des tablettes** et n'étaient versionnées nulle part : `git ls-files | grep html` ne rendait rien dans le dépôt d'origine. Elles diffèrent de deux lignes — `<title>` et `data-piece`.

Créer `app/gabarits/piece.html` :

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>@TITRE@</title>
<link rel="stylesheet" href="/local/wallpanel/wallpanel.css?v=@EMPREINTE@">
</head>
<body>
<div id="app" data-piece="@PIECE@" class="m3"></div>
<script src="/local/wallpanel/wallpanel.js?v=@EMPREINTE@"></script>
</body>
</html>
```

- [x] **Step 7: Écrire le générateur des trois pages**

Créer `app/scripts/generer-pages.mjs` :

```js
/** Genere les trois pages d'entree des tablettes depuis un gabarit unique.
 *
 *  Avant le 2026-09-04 elles etaient ecrites A LA MAIN et versionnees NULLE
 *  PART : `git ls-files | grep html` ne rendait rien dans le depot d'origine.
 *  Elles sont pourtant le point d'entree reel des trois Fire 7 — la `startUrl`
 *  de Fully pointe sur `/local/wallpanel/<piece>.html`. Les perdre, c'etait
 *  perdre le demarrage des tablettes sans qu'aucun test ne s'en apercoive.
 *
 *  L'empreinte est posee par versionner.mjs APRES ce script : ici on ecrit le
 *  jeton @EMPREINTE@, qui n'a de valeur qu'une fois le bundle construit.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const GABARIT = join(ICI, '..', 'gabarits', 'piece.html');
const SORTIE = join(ICI, '..', '..', 'dist');

/** Les trois pieces, et le titre que porte l'onglet de chacune.
 *  La liste est ici et pas dans `src/pieces.ts` a dessein : ce script tourne
 *  sous node avant toute compilation TypeScript. Le test
 *  `tests/pages.test.ts` verifie que les deux listes coincident. */
const PIECES = [
  { piece: 'salon', titre: 'Salon' },
  { piece: 'bureau', titre: 'Bureau' },
  { piece: 'cuisine', titre: 'Cuisine' },
];

mkdirSync(SORTIE, { recursive: true });
const gabarit = readFileSync(GABARIT, 'utf8');

for (const { piece, titre } of PIECES) {
  const page = gabarit
    .replaceAll('@TITRE@', titre)
    .replaceAll('@PIECE@', piece);
  writeFileSync(join(SORTIE, `${piece}.html`), page);
}
```

- [x] **Step 8: Brancher le générateur dans le build**

Dans `app/package.json`, le script `build` doit appeler `generer-pages.mjs` **entre** rollup et `versionner.mjs` — les pages doivent exister avant que l'empreinte n'y soit posée.

```json
"build": "rollup -c && node scripts/copier-assets.mjs && node scripts/generer-pages.mjs && node scripts/versionner.mjs"
```

Vérifier l'ordre réel du script existant avant d'éditer :
```bash
grep -n '"build"' /home/mallanic/Projects/Nivuus/packages/home-desk/app/package.json
```

- [x] **Step 9: Purger les chemins absolus restants de l'outillage**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk/app
grep -rn "/opt/nivuus/HomeAssistant" outils/ scripts/ *.js *.json
```

Remplacer chaque occurrence par un chemin relatif au dépôt, sur le modèle du Step 5. `outils/verifier-rendu.mjs` en portait deux, `outils/mesurer-*.mjs` une chacune.

- [x] **Step 10: Construire**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk/app
npm ci
npm run build
```

- [x] **Step 11: ══ PORTE ══ Le rebuild reproduit-il la production ?**

C'est le contrôle qui prouve que l'import est fidèle.

```bash
R=/home/mallanic/Projects/Nivuus/packages/home-desk
D=/opt/nivuus/home-manager/config/www/wallpanel
for f in wallpanel.js wallpanel.css; do
  a=$(sha256sum $R/dist/$f | cut -d' ' -f1)
  b=$(sudo -n sha256sum $D/$f | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo "$f IDENTIQUE" || echo "$f DIFFERENT ($a vs $b)"
done
diff <(sudo -n cat $D/salon.html) $R/dist/salon.html && echo "salon.html IDENTIQUE"
```
Expected: `wallpanel.js IDENTIQUE`, `wallpanel.css IDENTIQUE`, `salon.html IDENTIQUE`.

**Si l'un diffère, ARRÊTER le plan** et diagnostiquer avant toute autre tâche. Les causes plausibles, dans l'ordre : une version de node différente de celle qui a produit le bundle du 4 septembre ; un `npm ci` qui a résolu autrement que le `package-lock.json` d'alors ; ou — le cas grave — un fichier de `src/` absent de l'import. Un écart limité au `?v=` des pages est bénin et se règle en relançant `versionner.mjs` ; un écart sur `wallpanel.js` ne l'est pas.

- [x] **Step 12: Lancer le test de portabilité**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
git add -f dist/
python3 tests/test_dist_portable.py
```
Expected: `test_dist_portable: OK`

Le `-f` est nécessaire au premier passage seulement si un `.gitignore` hérité de l'application ignore `dist/` — vérifier `app/.gitignore` et, le cas échéant, y restreindre la règle.

- [x] **Step 13: Lancer la suite de l'application**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk/app && npm test
```
Expected: la suite vitest passe. Elle passait sur la machine d'origine le 2026-09-04 ; un échec ici signale un fichier manquant à l'import, pas une régression.

- [x] **Step 14: Commit**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
git add -A
git commit -m "build: sortie relative au depot, trois pages generees, chemins absolus purges

Le build ecrivait hors du depot, vers un chemin absolu de production : aucune
autre machine ne pouvait construire, et git archive HEAD n'emportait aucun
bundle. Il ecrit desormais dans dist/, suivi par git (decision 2).

Les trois <piece>.html etaient ecrites a la main et versionnees nulle part —
alors qu'elles sont le point d'entree reel des tablettes (startUrl de Fully).
Elles sont desormais generees depuis gabarits/piece.html.

Verifie : le rebuild reproduit a l'octet pres le bundle en production du
2026-09-04 01:01 (sha256 identiques sur wallpanel.js et wallpanel.css)."
```

---

### Task 3 : l'état nommé « garde-manger non installé »

`requires.packages` ne cite pas `home-stock` (décision 8) : la dépendance passe par le bus, jamais par un import. Le défaut de ce choix n'est pas l'absence, c'est le **silence** — et il est mesuré. `app/src/pieces.ts` (l. 402-405) documente que la tuile « Recette » s'appuie sur « le masquage générique de `rendu/corps.ts` » : `home_stock` non chargé ⇒ le capteur passe `unavailable` ⇒ `app/src/rendu/corps.ts:356` la filtre ⇒ **la tuile disparaît**. Un écran de cuisine d'où une fonction s'évapore sans un mot est un défaut.

**Files:**
- Modify: `app/src/pieces.ts` (le type `Commande`, et les 3 appels de la cuisine)
- Modify: `app/src/rendu/corps.ts:356` (le filtre) et `:105-109` (`ligneSynthese`)
- Test: `app/tests/corps.test.ts`

**Interfaces:**
- Consumes: `Etat.estUtilisable(id: string): boolean` (`app/src/etat.ts:50`).
- Produces: le champ optionnel `absenceNommee?: string` sur `Commande` et sur `EntreeSynthese`. Une commande qui le porte n'est **jamais** filtrée : elle est rendue inerte, avec ce libellé en sous-titre.

- [x] **Step 1: Écrire le test qui échoue**

Ajouter à `app/tests/corps.test.ts` :

```ts
describe('absence nommee', () => {
  it('filtre une commande dont l\'entite est indisponible', () => {
    const etat = etatAvec({});   // aucune entite connue
    const piece = pieceAvec([
      { libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal' },
    ]);
    expect(commandesVisibles(etat, piece)).toHaveLength(0);
  });

  it('CONSERVE une commande qui porte absenceNommee, et la rend inerte', () => {
    const etat = etatAvec({});
    const piece = pieceAvec([
      { libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal',
        absenceNommee: 'Garde-manger non installé' },
    ]);
    const visibles = commandesVisibles(etat, piece);
    expect(visibles).toHaveLength(1);
    expect(visibles[0].libelle).toBe('Recette');
  });

  it('rend le libelle d\'absence en sous-titre, pas un vide', () => {
    const etat = etatAvec({});
    const rendu = etiquette(etat, {
      libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal',
      absenceNommee: 'Garde-manger non installé',
    });
    expect(rendu).toBe('Garde-manger non installé');
  });

  it('ignore absenceNommee des que l\'entite redevient utilisable', () => {
    const etat = etatAvec({ 'sensor.home_stock_next_meal': { etat: 'Gratin' } });
    const rendu = etiquette(etat, {
      libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal',
      absenceNommee: 'Garde-manger non installé',
    });
    expect(rendu).not.toBe('Garde-manger non installé');
  });
});
```

Adapter les noms d'aides (`etatAvec`, `pieceAvec`, `commandesVisibles`) à ceux déjà employés dans `app/tests/corps.test.ts` — les lire avant d'écrire.

- [x] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd app && npx vitest run tests/corps.test.ts -t "absence nommee"`
Expected: FAIL — les deuxième et troisième cas échouent (la commande est filtrée, l'étiquette est vide).

- [x] **Step 3: Ajouter le champ au type**

Dans `app/src/pieces.ts`, sur l'interface qui déclare `libelle: string; icone: string; entite: string;` (l. 5) :

```ts
  /** Ce que la tuile AFFICHE quand son entite est absente ou `unavailable`,
   *  au lieu de disparaitre.
   *
   *  Le masquage generique de `rendu/corps.ts` est le bon defaut : une serrure
   *  muette ou un lecteur eteint n'ont rien a dire. Il ne l'est PAS quand
   *  l'entite vient d'un autre package : `home-desk` ne declare pas
   *  `home-stock` dans `requires.packages` (decision 8 de la spec) parce que
   *  la dependance passe par le bus, jamais par un import — mais installe sans
   *  lui, l'ecran de la cuisine voyait deux tuiles s'evaporer sans un mot.
   *  Une fonction absente doit se nommer. */
  absenceNommee?: string;
```

- [x] **Step 4: Ne plus filtrer ce qui porte le champ**

Dans `app/src/rendu/corps.ts`, ligne 356 :

```ts
  // Une commande qui NOMME son absence n'est jamais filtree : c'est tout
  // l'interet du champ (cf. `absenceNommee`, `pieces.ts`).
  const utilisables = piece.commandes.filter(
    (c) => etat.estUtilisable(c.entite) || c.absenceNommee !== undefined);
```

Et dans `etiquette()`, avant toute lecture d'état :

```ts
  if (!etat.estUtilisable(b.entite)) return b.absenceNommee ?? '';
```

Vérifier au passage la ligne 188, qui n'appelait `etiquette` que si `estUtilisable` : elle doit désormais l'appeler inconditionnellement, sans quoi le libellé d'absence ne serait jamais rendu.

- [x] **Step 5: Faire de même pour la ligne de synthèse**

`ligneSynthese` (l. 105-109) saute les entrées inutilisables. Le repas suivant y passe. Même traitement :

```ts
  for (const entree of entites) {
    if (!etat.estUtilisable(entree.entite)) {
      if (entree.absenceNommee) parts.push(entree.absenceNommee);
      continue;
    }
```

Ajouter `absenceNommee?: string;` au type `EntreeSynthese`.

- [x] **Step 6: Nommer les trois absences de la cuisine**

Dans `app/src/pieces.ts`, sur les trois points de contact mesurés avec `home_stock` :

```ts
      { libelle: 'Courses', icone: 'list', entite: 'todo.home_stock_shopping',
        vue: '#taches', absenceNommee: 'Garde-manger non installé' },
      { libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal',
        vue: '#recette', absenceNommee: 'Garde-manger non installé' },
      { libelle: 'Scanner', icone: 'scan', entite: 'sensor.home_stock_next_meal',
        absenceNommee: 'Garde-manger non installé' },
```

Conserver les autres champs de chaque ligne tels qu'ils sont — les relire avant d'éditer, `Scanner` porte notamment un lien vers le panneau `/home-stock`.

- [x] **Step 7: Lancer les tests**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk/app && npm test
```
Expected: la suite passe, les quatre nouveaux cas compris.

- [x] **Step 8: Reconstruire et committer**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk/app && npm run build
cd .. && git add -A
git commit -m "feat(cuisine): nommer l'absence du garde-manger au lieu de la taire

home-desk ne declare pas home-stock dans requires.packages (decision 8) : la
dependance passe par le bus — 3 entites, 3 commandes websocket — jamais par un
import, et l'imposer couterait le garde-manger a chaque installation des
tablettes du salon et du bureau, qui n'en ont aucun besoin.

Le defaut de ce choix etait le SILENCE. Mesure : pieces.ts l.402 documentait
que la tuile Recette s'appuie sur le masquage generique de corps.ts:356 —
home_stock absent => capteur unavailable => tuile filtree => disparue, sans un
mot. Trois tuiles de la cuisine etaient dans ce cas.

Le champ `absenceNommee` retire ces tuiles du filtre generique et leur fait
afficher « Garde-manger non installe ». Le masquage reste le defaut pour tout
le reste : une serrure muette n'a rien a dire."
```

---

### Task 4 : le manifeste, le `Makefile`, et le contrat vérifié par le vrai parseur

**Files:**
- Create: `nivuus-package.yaml`, `Makefile`, `tests/test_manifest_contract.py`

**Interfaces:**
- Consumes: rien.
- Produces: un package nommé `home-desk`, `tier: userspace`, `requires.packages == ("home-manager",)`, découvrable par `discover()` du moteur.

- [x] **Step 1: Écrire le test qui échoue**

Créer `tests/test_manifest_contract.py` :

```python
#!/usr/bin/env python3
"""Le manifeste doit passer le parseur du moteur, pas une relecture locale.

NIVUUS_INSTALLER_DIR fait valider par installer/packages/manifest.py, qui fait
autorite.

home-desk est le CAS D'ECOLE de requires.packages, et le moteur le dit
lui-meme : la docstring de installer/packages/dependencies.py porte « Ce n'est
pas une hypothese : plan_packages() ordonne par sorted(selected), et
`home-desk` trie AVANT `home-manager`. L'ordre alphabetique est exactement le
mauvais. » Ce test est donc la verification de la verification.

Run: python3 tests/test_manifest_contract.py
     make test NIVUUS_INSTALLER_DIR=$HOME/Projects/Nivuus/packages/installer
"""
import os
import pathlib
import sys

import yaml

REPO = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = REPO / "nivuus-package.yaml"

failures = []


def check(label, got, want):
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")


data = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))

check("apiVersion", data.get("apiVersion"), "nivuus.dev/v1")
check("nom", data.get("name"), "home-desk")
check("tier", data.get("tier"), "userspace")

# LA declaration qui fait de ce package un satellite, et le cas qui a motive
# le champ : « home-desk » trie AVANT « home-manager » en alphabetique.
check("depend du socle", (data.get("requires") or {}).get("packages"),
      ["home-manager"])

# home-stock n'y est PAS (decision 8) : la dependance passe par le bus, jamais
# par un import. C'est une dependance d'execution, pas d'installation.
check("ne force pas home-stock",
      "home-stock" in ((data.get("requires") or {}).get("packages") or []),
      False)

check("aucun bloc platform", "platform" in data, False)
check("aucun claim", "claims" in data, False)

# Ni apt ni wizard : l'application est du JavaScript servi par Home Assistant,
# et vignette/manifest.json declare requirements: []. Le bundle etant versionne
# (decision 2), Node n'est pas requis sur la cible.
check("aucune dependance apt", "apt" in data, False)
check("aucun wizard", "wizard" in data, False)

check("hook install", (data.get("hooks") or {}).get("install"),
      "hooks/install.py")
check("pas de hook activate", "activate" in (data.get("hooks") or {}), False)
check("pas de hook resolve", "resolve" in (data.get("hooks") or {}), False)

# Decision 4 : le package est propre a cette maison, et il doit l'AVOUER.
# Un package qui se pretend generique et ne l'est pas produit chez un tiers un
# ecran d'entites inexistantes, sans message.
label = data.get("label") or ""
if "maison" not in label.lower():
    failures.append(f"label: {label!r} ne dit pas que ce package est propre "
                    "a cette maison (decision 4)")

installer = os.environ.get("NIVUUS_INSTALLER_DIR")
if installer:
    sys.path.insert(0, str(pathlib.Path(installer) / "installer"))
    from packages.manifest import load_manifest

    manifest = load_manifest(str(MANIFEST))
    check("parseur du moteur: nom", manifest.name, "home-desk")
    check("parseur du moteur: dependance lue", manifest.packages,
          ("home-manager",))
    check("parseur du moteur: hook install resolu",
          manifest.hook_path("install").endswith("hooks/install.py"), True)
    check("parseur du moteur: aucun activate",
          manifest.hook_path("activate"), "")

    # Le tri topologique doit placer le socle AVANT ce package — contre
    # l'ordre alphabetique, qui est ici exactement le mauvais.
    from packages.dependencies import install_order

    socle = load_manifest(str(pathlib.Path(installer).parent
                              / "home-manager" / "nivuus-package.yaml"))
    ordre = [m.name for m in install_order([manifest, socle])]
    check("tri topologique", ordre, ["home-manager", "home-desk"])
else:
    print("NIVUUS_INSTALLER_DIR absent : verification locale seule")

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_manifest_contract: OK")
```

- [x] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `python3 tests/test_manifest_contract.py`
Expected: FAIL — `FileNotFoundError: nivuus-package.yaml`

- [x] **Step 3: Écrire le manifeste**

Créer `nivuus-package.yaml` :

```yaml
apiVersion: nivuus.dev/v1
name: home-desk
version: 1.0.0
label: "Tablettes murales de CETTE maison (affichage des trois ecrans)"
tier: userspace

# Le DEUXIEME satellite, apres home-stock. `requires.packages` fait installer
# home-manager AVANT ce package : le hook depose son bundle dans le
# `config/www/` que le socle vient de creer, son composant dans
# `config/custom_components/`, et son fragment d'automations dans
# `config/packages/`.
#
# Ce package est le CAS D'ECOLE du champ, et le moteur le dit lui-meme. La
# docstring de installer/packages/dependencies.py porte :
#
#   « Ce n'est pas une hypothese : plan_packages() ordonne par
#     sorted(selected), et `home-desk` trie AVANT `home-manager`. L'ordre
#     alphabetique est exactement le mauvais. »
#
# Sans cette ligne, le satellite ecrirait dans un repertoire que son socle n'a
# pas encore cree.
requires:
  packages: [home-manager]

# `home-stock` n'y figure PAS, deliberement (decision 8 de la spec).
# L'application le consomme — 3 entites et 3 commandes websocket, 15
# occurrences dans app/src/ — mais PAR LE BUS, jamais par un import. C'est une
# dependance d'execution, pas d'installation ; `requires` exprime le dur.
# Forcer le garde-manger imposerait un cout aux tablettes du salon et du
# bureau, qui n'en ont aucun besoin. Le silence que cela produisait dans la
# cuisine est corrige dans l'application elle-meme : `absenceNommee`, cf.
# app/src/pieces.ts.
#
# Ni `apt:`, ni `wizard:`, ni hook `activate` — les trois deliberement.
#
# `apt:` : l'application est du JavaScript servi par Home Assistant, et le
# bundle est VERSIONNE dans dist/ (decision 2), donc `git archive HEAD`
# l'emporte et la cible n'a jamais besoin de Node.
# custom_components/vignette/manifest.json declare `requirements: []` et sa
# seule `dependency` est `http`, composant interne de HA.
#
# `wizard:` : le chemin de depot vient du socle, l'application s'authentifie
# avec le jeton de session du navigateur (app/src/connexion.ts), et les 66
# `entity_id` en dur ne sont pas des questions qu'on pose a un operateur.
# Ce package est propre a CETTE maison, et son label le dit (decision 4).
#
# `activate` : le tri topologique garantit que ce package s'installe avant que
# le socle ne demarre Home Assistant. Un activate serait au mieux inutile, au
# pire une course — les unites nivuus-package-activate@<nom>.service vivent
# toutes dans multi-user.target.wants, et systemd ne les ordonne pas entre
# elles. C'est une dette connue du chantier requires.packages, et une raison
# de plus pour que ce package n'ait pas d'activate.
#
# `claims:` : les tablettes sont jointes par le RESEAU, via fully_kiosk. Aucun
# peripherique local n'est reclame, donc aucun conflit a declarer.
hooks:
  install: hooks/install.py
```

- [x] **Step 4: Écrire le `Makefile`**

Créer `Makefile` :

```make
# Package Nivuus home-desk — cibles de test.
#
# DEUX SUITES, DELIBEREMENT SEPAREES.
#
# `test` couvre le PACKAGE : manifeste, hook d'installation, portabilite et
# fraicheur de dist/. Scripts autonomes, python3 + PyYAML seulement, comme dans
# le depot installer — c'est ce qui permet de les lancer sur une machine qui
# n'a rien d'autre, y compris la cible d'installation.
#
# `test-app` couvre l'APPLICATION : 43 fichiers vitest, qui exigent Node et
# 115 Mo de node_modules. Les melanger rendrait le package intestable partout
# ou Node n'est pas installe — c'est-a-dire sur la cible.
#
# NIVUUS_INSTALLER_DIR fait valider le manifeste par le VRAI parseur du moteur.
#   make test NIVUUS_INSTALLER_DIR=$$HOME/Projects/Nivuus/packages/installer

PACKAGE_DIR := $(CURDIR)
PYTHON ?= python3

.PHONY: test test-app help

help:
	@grep -E '^[a-zA-Z_-]+:.*' $(MAKEFILE_LIST) | sed 's/:.*//' | sort

test:
	@for t in test_manifest_contract test_install_hook test_dist_portable test_dist_a_jour; do \
	    echo "--- $$t"; \
	    $(PYTHON) $(PACKAGE_DIR)/tests/$$t.py || exit 1; \
	done

test-app:
	cd $(PACKAGE_DIR)/app && npm test
```

- [x] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `python3 tests/test_manifest_contract.py`
Expected: `test_manifest_contract: OK` (avec la note `NIVUUS_INSTALLER_DIR absent`)

- [x] **Step 6: Vérifier avec le vrai parseur du moteur**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
python3 tests/test_manifest_contract.py 2>&1 | tail -3
NIVUUS_INSTALLER_DIR=$HOME/Projects/Nivuus/packages/installer python3 tests/test_manifest_contract.py
```
Expected: `test_manifest_contract: OK`, **sans** la note — et donc avec le tri topologique vérifié.

- [x] **Step 7: Commit**

```bash
git add nivuus-package.yaml Makefile tests/test_manifest_contract.py
git commit -m "feat(package): manifeste nivuus.dev/v1, requires.packages [home-manager]

home-desk est le cas d'ecole du champ, et le moteur le nomme : sa docstring
dit que « home-desk trie AVANT home-manager, l'ordre alphabetique est
exactement le mauvais ». Le test verifie le tri topologique avec le vrai
parseur, pas avec une relecture locale.

home-stock n'est PAS dans requires (decision 8) : dependance de bus, pas
d'installation."
```

---

### Task 5 : `vignette` importé, et son manifeste qui dit la vérité

173 lignes écrites pour les Fire 7, sans autre consommateur mesuré dans `config/`, et non versionnées **nulle part**. L'intégrité de l'affichage en dépend directement : l'affiche 2000×3000 que Plex publie occupe ~23 Mo décodée et tue la WebView — 4 morts en 48 s mesurées, 1 à 800×1200, 0 à 400×600.

**Files:**
- Create: `custom_components/vignette/__init__.py`, `custom_components/vignette/manifest.json`

**Interfaces:**
- Consumes: rien.
- Produces: l'arbre `custom_components/vignette/`, deuxième source de dépôt du hook de la Task 7. Sert `/api/vignette?url=<entity_picture signée>&w=<largeur>`, consommé par `app/src/media.ts`.

- [x] **Step 1: Importer le composant**

```bash
R=/home/mallanic/Projects/Nivuus/packages/home-desk
mkdir -p $R/custom_components
sudo -n rsync -a --exclude '__pycache__/' \
  /opt/nivuus/home-manager/config/custom_components/vignette/ \
  $R/custom_components/vignette/
sudo -n chown -R "$(id -un):$(id -gn)" $R/custom_components/vignette
ls -la $R/custom_components/vignette/
```
Expected: `__init__.py` (7738 octets) et `manifest.json` (227 octets), pas de `__pycache__`.

- [x] **Step 2: Vérifier le dépôt que le manifeste annonce**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://github.com/nivuus/vignette
```

- [x] **Step 3: Faire dire la vérité au manifeste**

Si le Step 2 rend `404` (dépôt inexistant), remplacer le champ `documentation` de `custom_components/vignette/manifest.json` :

```json
{
  "domain": "vignette",
  "name": "Vignette",
  "version": "1.0.0",
  "documentation": "https://github.com/nivuus/home-desk",
  "dependencies": ["http"],
  "codeowners": [],
  "requirements": [],
  "iot_class": "local_push"
}
```

Si le Step 2 rend `200`, laisser le champ tel quel et le noter dans `CLAUDE.md` (Task 8) : le composant a un dépôt propre, et son entrée dans `home-desk` est une copie à tenir à jour.

Un manifeste qui pointe vers rien est un piège de plus, et cette spec existe pour en retirer, pas pour en ajouter.

- [x] **Step 4: Vérifier qu'aucun autre consommateur n'a été manqué**

```bash
sudo -n grep -rl "api/vignette" /opt/nivuus/home-manager/config/ \
  --exclude-dir=.storage --exclude-dir=backups --exclude-dir=www 2>/dev/null
```
Expected: aucune sortie. La mesure du 2026-08-29 disait déjà « aucun consommateur hors le bundle des tablettes » ; ce contrôle la refait avant que la décision 5 ne devienne irréversible en pratique.

- [x] **Step 5: Commit**

```bash
git add custom_components/vignette
git commit -m "feat(vignette): le composant part avec home-desk (decision 5)

173 lignes ecrites pour les Fire 7, aucun autre consommateur mesure dans
config/, et versionnees NULLE PART jusqu'ici. Un package doit maitriser la
dependance dont depend sa propre integrite : sans le redimensionnement,
l'affiche 2000x3000 de Plex occupe ~23 Mo decodee et tue la WebView — 4 morts
en 48 s mesurees, 0 a 400x600.

Le laisser au socle l'aurait fait grossir pour le compte d'un satellite ; en
faire un troisieme package aurait ete un depot pour 173 lignes."
```

---

### Task 6 : les sept automations « Tablettes » en fragment

Décision 6 : elles entrent dans le package, réécrites en un fragment `packages/home_desk.yaml` chargé par `!include_dir_named`. Les laisser au socle livrerait trois écrans **sans luminosité adaptative, sans garde thermique et sans thème jour/nuit** — le package ne remplirait pas sa fonction. Les insérer dans `automations.yaml` fusionnerait dans le fichier que l'interface de Home Assistant réécrit en entier : écarté.

**Cette tâche écrit le fichier. Elle ne retire rien.** Le retrait des sept blocs d'`automations.yaml` est la Task 10, derrière une porte.

**Files:**
- Create: `packages/home_desk.yaml`
- Read-only: `DEPLOY/automations.yaml` (blocs aux lignes 2641, 2701, 3261, 3289, 3311, 3345, 3393)

**Interfaces:**
- Consumes: rien du dépôt.
- Produces: `packages/home_desk.yaml`, troisième source de dépôt du hook (Task 7), copié — jamais par remplacement de répertoire — vers `config/packages/home_desk.yaml`.

- [x] **Step 1: Extraire les sept blocs, verbatim**

Ces automations portent du savoir chèrement acquis — la description de `tablettes_luminosite_adaptative` documente 176 redémarrages relevés, dont 91 sur une minute multiple de 10, et la raison pour laquelle elle n'écrit plus que si la valeur change. **Extraire, ne pas réécrire.**

```bash
C=/opt/nivuus/home-manager/config
sudo -n python3 - <<'PY' > /tmp/home_desk_extrait.yaml
import yaml
blocs = yaml.safe_load(open('/opt/nivuus/home-manager/config/automations.yaml',
                            encoding='utf-8'))
gardes = [b for b in blocs
          if str(b.get('alias', '')).startswith('Tablettes')]
print(yaml.safe_dump({'automation': gardes},
                     allow_unicode=True, sort_keys=False, width=100))
PY
grep -c "alias:" /tmp/home_desk_extrait.yaml
```
Expected: `7`.

Si le compte diffère de 7, **arrêter** : `automations.yaml` a bougé depuis la mesure du 2026-09-04, et le fragment ne serait pas le décalque de ce qui tourne.

- [x] **Step 2: Écrire le fragment, avec son en-tête**

Créer `packages/home_desk.yaml` — l'en-tête d'abord, puis le contenu de `/tmp/home_desk_extrait.yaml` :

```yaml
# Les sept automations des trois tablettes murales.
#
# CE FICHIER N'EST CHARGE QUE SI configuration.yaml DECLARE :
#     packages: !include_dir_named packages
# La ligne manquait au 2026-09-04, et le fragment d'intents de `home-stock`
# etait dans le meme cas : depose, jamais charge. Le hook d'installation la
# SIGNALE, il ne l'ecrit pas — configuration.yaml est un fichier que le
# proprietaire tient a la main, et le PRESERVED du socle le protege.
#
# POURQUOI ICI ET PAS DANS automations.yaml. Home Assistant charge
# `config/packages/` par REPERTOIRE, ce qui permet a un package d'y deposer un
# fichier sans fusionner. `automations.yaml` est un fichier unique que
# l'interface graphique de Home Assistant reecrit EN ENTIER : y inserer sept
# blocs depuis un hook, c'est prendre en charge une fusion sur le fichier que
# le proprietaire edite le plus. `home-stock` a resolu le meme probleme de la
# meme facon.
#
# CE QU'ELLES PILOTENT. L'integration `fully_kiosk` et ses
# switch/number/button — du MATERIEL, pas de l'affichage. Elles marcheraient a
# l'identique si les tablettes affichaient autre chose. Elles entrent quand
# meme dans ce package parce que sans elles, une installation neuve laisse
# trois ecrans allumes en permanence, sans garde thermique : le package ne
# remplirait pas sa fonction.
#
# LES `id:` SONT CONSERVES A L'IDENTIQUE. Ils fixent l'`entity_id` des sept
# entites `automation.*` dans le registre : les changer perdrait l'historique,
# les traces et toute reference exterieure.
#
# CONSEQUENCE A CONNAITRE : une automation definie en YAML n'est plus EDITABLE
# depuis l'interface de Home Assistant. Elle s'y voit, elle s'y declenche, elle
# ne s'y modifie plus. C'est le prix de la voie propre, et il est assume.
#
# Extrait de config/automations.yaml le 2026-09-04 (lignes 2641, 2701, 3261,
# 3289, 3311, 3345, 3393 ; 283 lignes sur 4560). Le retrait de ces blocs de
# automations.yaml est la Task 10 du plan, apres constat que ce fragment est
# charge.

automation:
  # les sept blocs de /tmp/home_desk_extrait.yaml, colles ici SANS retouche
```

**Ces 283 lignes ne sont pas retranscrites dans ce plan, et c'est délibéré.**
Les recopier à la main dans un document exposerait à une erreur de
transcription qui changerait silencieusement une automation d'une maison
vivante — la description de `tablettes_luminosite_adaptative` fait à elle seule
quinze lignes de mesures. Le Step 1 les produit mécaniquement, le Step 4 vérifie
l'égalité exacte bloc par bloc. C'est la seule façon sûre.

- [x] **Step 3: Vérifier que le fragment est un YAML valide et complet**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
python3 - <<'PY'
import yaml
d = yaml.safe_load(open('packages/home_desk.yaml', encoding='utf-8'))
autos = d['automation']
print("automations :", len(autos))
print("ids         :", [a['id'] for a in autos])
manquants = [a['alias'] for a in autos if not str(a['alias']).startswith('Tablettes')]
print("hors perimetre :", manquants)
PY
```
Expected: `automations : 7`, sept `id` dont `tablettes_luminosite_adaptative` et `tablettes_presence_lit`, `hors perimetre : []`.

- [x] **Step 4: Vérifier que le fragment est le décalque exact de la production**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
sudo -n python3 - <<'PY'
import yaml
prod = yaml.safe_load(open('/opt/nivuus/home-manager/config/automations.yaml',
                           encoding='utf-8'))
prod = [b for b in prod if str(b.get('alias','')).startswith('Tablettes')]
frag = yaml.safe_load(open('/home/mallanic/Projects/Nivuus/packages/home-desk/'
                           'packages/home_desk.yaml', encoding='utf-8'))['automation']
par_id = {a['id']: a for a in prod}
for a in frag:
    if par_id.get(a['id']) != a:
        print("ECART sur", a['id'])
        break
else:
    print("DECALQUE EXACT des sept blocs")
PY
```
Expected: `DECALQUE EXACT des sept blocs`

- [x] **Step 5: Commit**

```bash
git add packages/home_desk.yaml
git commit -m "feat(automations): les sept automations Tablettes en fragment de package

Decision 6. Les laisser au socle aurait livre trois ecrans sans luminosite
adaptative, sans garde thermique et sans theme jour/nuit — le package ne
remplirait pas sa fonction. Les inserer dans automations.yaml aurait demande
de fusionner dans le fichier que l'interface de HA reecrit en entier.

Extraction VERBATIM, ids conserves : ces blocs portent du savoir mesure (la
description de tablettes_luminosite_adaptative documente 176 redemarrages
releves et pourquoi elle n'ecrit plus que si la valeur change). Les reecrire
aurait perdu ce savoir.

Le fichier est ecrit, RIEN n'est retire d'automations.yaml : c'est la Task 10,
et elle est derriere une porte."
```

---

### Task 7 : le hook d'installation et ses trois tests

**Files:**
- Create: `hooks/install.py`, `tests/test_install_hook.py`, `tests/test_dist_a_jour.py`

**Interfaces:**
- Consumes: `dist/` (Task 2, 3), `custom_components/vignette/` (Task 5), `packages/home_desk.yaml` (Task 6).
- Produces: `python3 hooks/install.py --phase install --root <racine>`, lisant un contexte JSON sur stdin, émettant des événements `{"event": "progress"|"done"}` sur stdout, `0` en succès, `1` si le socle est absent.

- [x] **Step 1: Écrire le test qui échoue**

Créer `tests/test_install_hook.py` :

```python
#!/usr/bin/env python3
"""Le hook depose trois choses, et n'abime rien de ce qu'il partage.

LE TEST LE PLUS IMPORTANT DE CE FICHIER est celui des occupants intacts.
`config/www/` porte onze occupants mesures le 2026-09-04 (community de HACS,
nivuus-panel, media, uploaded, deux sauvegardes datees...) et `config/packages/`
porte le fragment d'intents de `home-stock`. Un hook qui remplacerait l'un ou
l'autre repertoire detruirait le travail des autres integrations. Les occupants
sont COMPTES, jamais nommes : leur nombre bouge (neuf le 2026-08-29, onze le
2026-09-04) et un test qui les nommerait casserait au premier ajout.

Aucun test ne touche la production : --root pointe vers un repertoire temporaire.

Run: python3 tests/test_install_hook.py
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import threading

REPO = pathlib.Path(__file__).resolve().parents[1]
HOOK = REPO / "hooks" / "install.py"
CONFIG_REL = "opt/nivuus/home-manager/config"

failures = []


def check(label, got, want):
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")


def lancer(root, contexte=None):
    return subprocess.run(
        [sys.executable, str(HOOK), "--phase", "install", "--root", str(root)],
        input=json.dumps(contexte or {}), capture_output=True, text=True)


def socle(root, configuration=""):
    """Un socle minimal, avec ses repertoires partages deja peuples."""
    config = pathlib.Path(root) / CONFIG_REL
    (config / "www" / "community").mkdir(parents=True)
    (config / "www" / "nivuus-panel").mkdir()
    (config / "www" / "wifi-qrcode-card.js").write_text("// autrui")
    (config / "packages").mkdir()
    (config / "packages" / "home_stock_intents.yaml").write_text("intent_script: {}")
    (config / "custom_components").mkdir()
    (config / "configuration.yaml").write_text(configuration, encoding="utf-8")
    return config


# --- 1. Il refuse si le socle est absent -----------------------------------
with tempfile.TemporaryDirectory() as root:
    r = lancer(root)
    check("refus sans socle: code", r.returncode, 1)
    if "home-manager" not in r.stderr:
        failures.append(f"refus sans socle: stderr muet sur la cause: {r.stderr!r}")
    check("refus sans socle: rien de cree",
          (pathlib.Path(root) / CONFIG_REL).exists(), False)

# --- 2. Il depose les trois artefacts aux bons chemins ---------------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "vignette:\npackages: !include_dir_named packages\n")
    r = lancer(root)
    check("depot: code", r.returncode, 0)
    check("bundle", (config / "www" / "wallpanel" / "wallpanel.js").is_file(), True)
    check("css", (config / "www" / "wallpanel" / "wallpanel.css").is_file(), True)
    check("page salon", (config / "www" / "wallpanel" / "salon.html").is_file(), True)
    check("assets", (config / "www" / "wallpanel" / "assets").is_dir(), True)
    check("vignette", (config / "custom_components" / "vignette"
                       / "__init__.py").is_file(), True)
    check("fragment", (config / "packages" / "home_desk.yaml").is_file(), True)

    # --- 3. Les repertoires PARTAGES sont intacts -------------------------
    check("occupants de www/ intacts", len(list((config / "www").iterdir())), 4)
    check("fragment d'autrui intact",
          (config / "packages" / "home_stock_intents.yaml").is_file(), True)
    check("occupants de packages/ intacts",
          len(list((config / "packages").iterdir())), 2)

    # --- 4. Idempotence ---------------------------------------------------
    r2 = lancer(root)
    check("idempotence: code", r2.returncode, 0)
    check("idempotence: occupants de www/",
          len(list((config / "www").iterdir())), 4)

    # --- 5. Un fichier obsolete disparait ---------------------------------
    perime = config / "www" / "wallpanel" / "perime.js"
    perime.write_text("// version precedente")
    lancer(root)
    check("fichier obsolete retire", perime.exists(), False)

    # --- 6. Silence quand les deux lignes sont declarees -------------------
    sortie = lancer(root).stdout
    if "vignette:" in sortie and "manque" in sortie.lower():
        failures.append("signale `vignette:` alors qu'elle est declaree")
    if "include_dir_named" in sortie:
        failures.append("signale `packages:` alors qu'elle est declaree")

# --- 7. Il SIGNALE les deux lignes manquantes, sans les ecrire -------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "homeassistant:\n  name: Maison\n")
    r = lancer(root)
    check("signalement: code", r.returncode, 0)
    if "vignette:" not in r.stdout:
        failures.append("ne signale pas la ligne `vignette:` manquante")
    if "packages: !include_dir_named packages" not in r.stdout:
        failures.append("ne signale pas la ligne `packages:` manquante")
    check("configuration.yaml NON reecrit",
          (config / "configuration.yaml").read_text(encoding="utf-8"),
          "homeassistant:\n  name: Maison\n")
    # Le fragment est depose quand meme : c'est du texte inerte tant que rien
    # ne le charge, et son absence rendrait le signalement incomprehensible.
    check("fragment depose malgre tout",
          (config / "packages" / "home_desk.yaml").is_file(), True)

# --- 8. Une declaration vers un AUTRE repertoire ne compte pas -------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "vignette:\npackages: !include_dir_named ailleurs\n")
    r = lancer(root)
    if "packages: !include_dir_named packages" not in r.stdout:
        failures.append("ne signale pas une declaration qui vise un AUTRE "
                        "repertoire que celui ou le fragment est depose")

# --- 9. Deux executions concurrentes ne s'entrelacent pas ------------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "vignette:\npackages: !include_dir_named packages\n")
    resultats = []
    fils = [threading.Thread(target=lambda: resultats.append(lancer(root)))
            for _ in range(4)]
    for f in fils:
        f.start()
    for f in fils:
        f.join()
    check("concurrence: tous en succes",
          sorted(r.returncode for r in resultats), [0, 0, 0, 0])
    check("concurrence: bundle en place",
          (config / "www" / "wallpanel" / "wallpanel.js").is_file(), True)
    check("concurrence: vignette complete",
          (config / "custom_components" / "vignette" / "__init__.py").is_file(),
          True)

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_install_hook: OK")
```

- [x] **Step 2: Écrire le second test qui échoue**

Créer `tests/test_dist_a_jour.py` :

```python
#!/usr/bin/env python3
"""dist/ commite doit correspondre a app/src/ commite.

Le corollaire indispensable d'un bundle versionne (decision 2). Sans ce test,
la seule chose que la decision garantit est qu'UN bundle est livre — pas qu'il
corresponde aux sources livrees avec lui. Un dist/ perime serait depose sur les
trois tablettes sans que rien ne le signale, et le mode de panne est muet : les
tablettes afficheraient l'ancienne version pour toujours.

Ce test exige Node. Il SAUTE proprement quand Node est absent — il tourne alors
sur la machine de developpement et en CI, pas sur la cible d'installation, ou
il n'aurait aucun sens.

Run: python3 tests/test_dist_a_jour.py
"""
import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]
APP = REPO / "app"
DIST = REPO / "dist"

if shutil.which("npm") is None:
    print("test_dist_a_jour: SAUTE (npm absent)")
    sys.exit(0)

if not (APP / "node_modules").is_dir():
    print("test_dist_a_jour: SAUTE (node_modules absent — lancer `npm ci` "
          "dans app/ pour activer ce test)")
    sys.exit(0)

build = subprocess.run(["npm", "run", "build"], cwd=APP,
                       capture_output=True, text=True)
if build.returncode != 0:
    print("le build a echoue :\n" + build.stderr)
    sys.exit(1)

ecarts = subprocess.run(["git", "-C", str(REPO), "status", "--porcelain", "dist"],
                        capture_output=True, text=True, check=True).stdout.strip()
if ecarts:
    print("dist/ commite ne correspond PAS a app/src/ commite.\n"
          "Le build vient de produire un resultat different de ce qui est\n"
          "versionne. Reconstruire et committer dist/ :\n"
          "    cd app && npm run build && cd .. && git add dist && git commit\n"
          "\nFichiers en ecart :\n" + ecarts)
    sys.exit(1)

print("test_dist_a_jour: OK")
```

- [x] **Step 3: Lancer les deux tests pour vérifier qu'ils échouent**

Run: `python3 tests/test_install_hook.py`
Expected: FAIL — `can't open file 'hooks/install.py'`

Run: `python3 tests/test_dist_a_jour.py`
Expected: `test_dist_a_jour: OK` — il passe déjà, `dist/` ayant été construit et committé en Task 2 et 3. C'est attendu : ce test est un garde-fou permanent, pas un test à faire échouer d'abord.

- [x] **Step 4: Écrire le hook**

Créer `hooks/install.py` :

```python
#!/usr/bin/env python3
"""Phase install du package home-desk : deposer l'affichage des tablettes.

Ce package est un SATELLITE : il n'a pas de repertoire de deploiement a lui, il
ecrit dans celui que `home-manager` a cree. Son manifeste le declare par
`requires: packages: [home-manager]`, ce qui fait installer le socle en premier
— et ce package est le cas d'ecole du champ, puisque « home-desk » trie AVANT
« home-manager » en alphabetique.

QUATRE REGLES.

1. IL REFUSE SI LE SOCLE EST ABSENT. `requires.packages` bloque deja le cas
   dans le wizard, mais ce hook tourne aussi en autonome — `--root /`, un
   config.json ecrit a la main — ou rien ne l'a valide. Creer une arborescence
   orpheline que personne ne lira serait pire que refuser.

2. IL REMPLACE CE QUI PORTE SON NOM, IL COPIE DANS CE QU'IL PARTAGE.
   `www/wallpanel/` et `custom_components/vignette/` portent le nom du
   package : ils sont remplaces en entier, sans quoi un fichier retire entre
   deux versions et les __pycache__ perimes survivraient — des fichiers
   fantomes que Home Assistant chargerait.
   `www/` et `packages/` sont PARTAGES : onze occupants mesures dans le
   premier au 2026-09-04 (HACS, nivuus-panel, media, uploaded, deux
   sauvegardes datees...), et le fragment d'intents de `home-stock` dans le
   second. Les remplacer supprimerait le travail des autres. Pour ceux-la, un
   fichier est copie, jamais un repertoire.

3. DEUX EXECUTIONS CONCURRENTES SE SERIALISENT. Reexecuter ce hook est le seul
   mecanisme de mise a jour. Voir exclusive_deposit().

4. IL N'ECRIT JAMAIS DANS configuration.yaml — il SIGNALE deux lignes.
   `vignette:` et `packages: !include_dir_named packages`. Le fichier porte les
   automations d'une maison entiere ; le PRESERVED de home-manager le protege,
   et home-stock a explicitement rejete l'insertion idempotente au profit d'un
   message. La ligne `packages:` etait ABSENTE au 2026-09-04, et le fragment
   d'intents de home-stock etait dans le meme cas : depose, jamais charge.

LE DEPOT DU BUNDLE EST ATOMIQUE, ET CE N'EST PAS UNE PRECAUTION. replace_tree()
copie vers un voisin temporaire puis bascule par os.replace(). Le motif vient
de home-stock, ou une revue a mesure 291 lectures sur fichier absent pendant la
fenetre rmtree + copytree. Ici c'est PIRE : `www/wallpanel/` est lu par TROIS
clients qui rechargent tout seuls. C'est aussi pourquoi dist/ contient ses
assets — un dist/ complet se depose en UN geste.
"""
import argparse
import contextlib
import fcntl
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Le repertoire de configuration cree par home-manager.
CONFIG_REL = "opt/nivuus/home-manager/config"

# Repertoires qui portent le nom du package : remplaces en entier.
OWNED_TREES = (
    ("dist", "www/wallpanel"),
    ("custom_components/vignette", "custom_components/vignette"),
)

# Fichier depose dans un repertoire PARTAGE : copie seul, jamais par
# remplacement du repertoire, qui appartient aussi a home-stock.
# Il est depose INCONDITIONNELLEMENT : c'est du texte inerte tant que rien ne
# le charge, et son absence rendrait le signalement de la regle 4
# incomprehensible — l'operateur ajouterait une ligne pour charger un fichier
# qui n'existe pas.
FRAGMENT_REL = "packages/home_desk.yaml"
SHARED_FILES = (
    (FRAGMENT_REL, FRAGMENT_REL),
)

# Les deux lignes que le hook controle sans jamais les ecrire.
PACKAGES_DECLARATION = "packages: !include_dir_named packages"
VIGNETTE_DECLARATION = "vignette:"

# Les deux tags que Home Assistant accepte pour charger un repertoire de
# paquets, et le nom du repertoire qu'ils designent — capture indispensable :
# `packages: !include_dir_named autre_dossier` declare bien quelque chose, mais
# pas le repertoire ou ce hook depose son fragment.
PACKAGES_RE = re.compile(
    r"^\s*packages:\s*!include_dir_(?:merge_)?named\s+(\S+)\s*$", re.MULTILINE)
# `vignette:` en debut de ligne, sans indentation : c'est une cle de premier
# niveau. Indentee, elle appartiendrait a un autre bloc et n'activerait rien.
VIGNETTE_RE = re.compile(r"^vignette:\s*$", re.MULTILINE)


def emit(event):
    print(json.dumps(event), flush=True)


def _discard(path):
    """Ecarter ce qui occupe deja `path`, quelle que soit sa nature."""
    if not os.path.lexists(path):
        return
    if os.path.isdir(path) and not os.path.islink(path):
        shutil.rmtree(path)
    else:
        os.remove(path)


def replace_tree(source, dest):
    """Remplacer dest par source, sans jamais laisser dest absent.

    Reprise a l'identique de home-stock/hooks/install.py. Voir l'en-tete de
    module pour la raison : trois clients relisent ce repertoire tout seuls.
    """
    parent = os.path.dirname(dest)
    os.makedirs(parent, exist_ok=True)

    tmp = dest + ".new"
    old_aside = dest + ".old"
    _discard(tmp)
    _discard(old_aside)

    try:
        shutil.copytree(source, tmp, symlinks=True)
    except Exception:
        _discard(tmp)
        raise

    moved_old = os.path.lexists(dest)
    if moved_old:
        if os.path.isdir(dest) and not os.path.islink(dest):
            os.replace(dest, old_aside)
        else:
            os.remove(dest)
            moved_old = False

    os.replace(tmp, dest)

    if moved_old:
        shutil.rmtree(old_aside)


def copy_file(source, dest):
    """Deposer un fichier dans un repertoire partage, sans toucher au reste."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(source, dest)


def _lire_configuration(config_dir):
    """Le texte de configuration.yaml, ou "" s'il est illisible.

    Une recherche textuelle, pas un yaml.safe_load : configuration.yaml est
    plein de tags !include et !secret que le parseur standard refuse.

    La lecture est TOLERANTE a l'encodage : ce controle tourne APRES les
    depots, donc une UnicodeDecodeError ici ferait echouer l'installation
    entiere alors que tous les fichiers sont deja en place — pire que le
    message superflu qu'elle empecherait.
    """
    path = os.path.join(config_dir, "configuration.yaml")
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def declares_packages(texte):
    """configuration.yaml charge-t-il le repertoire ou ce hook depose ?

    LIMITE ASSUMEE, la meme que chez home-stock : une declaration logee dans un
    fichier inclus echappe a cette recherche. Le hook signalera alors une ligne
    deja presente ailleurs — un message superflu, jamais une perte.
    """
    wanted = os.path.dirname(FRAGMENT_REL)
    return any(m.group(1) == wanted for m in PACKAGES_RE.finditer(texte))


def declares_vignette(texte):
    """configuration.yaml active-t-il le composant de redimensionnement ?"""
    return VIGNETTE_RE.search(texte) is not None


@contextlib.contextmanager
def exclusive_deposit(config_dir):
    """Serialiser les executions concurrentes du hook sur le meme socle.

    Le verrou porte sur config_dir lui-meme : il existe forcement a cet instant
    (la regle 1 vient de le verifier) et ce n'est l'artefact d'aucune des deux
    executions — contrairement a tout ce que ce hook depose.
    """
    fd = os.open(config_dir, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", required=True)
    parser.add_argument("--root", default="/")
    args = parser.parse_args()
    json.load(sys.stdin)          # le contexte est lu, rien n'en depend ici
    root = args.root.rstrip("/") or "/"

    config_dir = os.path.join(root, CONFIG_REL)

    # Regle 1 : refuser plutot que de creer un orphelin.
    if not os.path.isdir(config_dir):
        print("home-desk install: le package home-manager n'est pas installe "
              f"({config_dir} est absent) ; l'affichage des tablettes depose "
              "ses fichiers dans la configuration de Home Assistant, qu'il ne "
              "cree pas lui-meme", file=sys.stderr)
        return 1

    with exclusive_deposit(config_dir):
        emit({"event": "progress", "pct": 20,
              "msg": "Depose du bundle des tablettes"})
        replace_tree(os.path.join(HERE, "dist"),
                     os.path.join(config_dir, "www/wallpanel"))

        emit({"event": "progress", "pct": 50,
              "msg": "Depose du composant de redimensionnement"})
        replace_tree(os.path.join(HERE, "custom_components/vignette"),
                     os.path.join(config_dir, "custom_components/vignette"))

        emit({"event": "progress", "pct": 70,
              "msg": "Depose des automations des tablettes"})
        for rel_source, rel_dest in SHARED_FILES:
            copy_file(os.path.join(HERE, rel_source),
                      os.path.join(config_dir, rel_dest))

        # Regle 4 : signaler, jamais ecrire.
        texte = _lire_configuration(config_dir)

        if not declares_vignette(texte):
            emit({"event": "progress", "pct": 85,
                  "msg": "Le redimensionnement des affiches n'est PAS actif : "
                         "ajoutez cette ligne a configuration.yaml, en premier "
                         f"niveau : {VIGNETTE_DECLARATION} — sans elle, les "
                         "affiches de media arrivent en pleine resolution sur "
                         "les tablettes ; une affiche 2000x3000 occupe ~23 Mo "
                         "decodee et tue la WebView des Fire 7"})

        if not declares_packages(texte):
            emit({"event": "progress", "pct": 92,
                  "msg": "Les automations des tablettes sont deposees mais NE "
                         "SERONT PAS CHARGEES : ajoutez cette ligne a "
                         "configuration.yaml, sous « homeassistant: » : "
                         f"{PACKAGES_DECLARATION} — sans elle, les trois "
                         "ecrans restent sans luminosite adaptative, sans "
                         "garde thermique et sans theme jour/nuit"})

        emit({"event": "progress", "pct": 95,
              "msg": "Affichage des tablettes depose dans la configuration "
                     "de Home Assistant"})

    emit({"event": "done"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [x] **Step 5: Rendre le hook exécutable**

```bash
chmod +x /home/mallanic/Projects/Nivuus/packages/home-desk/hooks/install.py
```

- [x] **Step 6: Lancer le test pour vérifier qu'il passe**

Run: `python3 tests/test_install_hook.py`
Expected: `test_install_hook: OK`

- [x] **Step 7: Lancer la suite complète du package**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
make test NIVUUS_INSTALLER_DIR=$HOME/Projects/Nivuus/packages/installer
```
Expected: les quatre tests passent.

- [x] **Step 8: Commit**

```bash
git add hooks/install.py tests/test_install_hook.py tests/test_dist_a_jour.py
git commit -m "feat(hook): deposer bundle, vignette et automations chez le socle

Modele exact de home-stock/hooks/install.py — memes regles, memes primitives,
memes raisons.

Il remplace ce qui porte son nom (www/wallpanel/, custom_components/vignette/),
il COPIE dans ce qu'il partage (packages/home_desk.yaml). www/ portait onze
occupants au 2026-09-04 et packages/ porte le fragment d'intents de
home-stock : un remplacement de repertoire y detruirait le travail d'autrui.
C'est ce que teste le controle des occupants intacts, et c'est le test qui
protege du bug le plus couteux imaginable ici.

Le depot est atomique par replace_tree(). Chez home-stock ce motif venait de
291 lectures mesurees sur fichier absent ; ici www/wallpanel/ est relu par
TROIS clients qui rechargent tout seuls.

Il signale DEUX lignes de configuration.yaml sans jamais les ecrire —
`vignette:` et `packages: !include_dir_named packages`, la seconde etant
mesuree ABSENTE au 2026-09-04."
```

---

### Task 8 : `README.md` et `CLAUDE.md`

La décision 4 exige que la portée soit écrite **en toutes lettres** : un package qui se prétend générique et ne l'est pas produit chez un tiers un écran d'entités inexistantes, sans message. Les décisions 6 et 7 laissent des gestes à l'opérateur, qui doivent être écrits là où on les cherchera.

**Files:**
- Create: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien de code.

- [x] **Step 1: Écrire le `README.md`**

````markdown
# Tablettes murales (`home-desk`)

L'application dédiée qui tourne sur les trois tablettes Fire 7 de la maison —
salon, bureau, cuisine. TypeScript + `lit`, construite par rollup, servie par
Home Assistant depuis `config/www/wallpanel/`.

## ⚠️ Ce package est propre à UNE maison

Ce n'est pas une base paramétrable, et ce n'est pas un oubli.

- `app/src/` cite **66 `entity_id` en dur**, répartis en 18 domaines.
- `app/src/pieces.ts` déclare `PIECES: Record<'salon' | 'bureau' | 'cuisine', Piece>` —
  les trois pièces sont un **type TypeScript**, pas une donnée de configuration.

Installé ailleurs, il affiche un écran d'entités inexistantes. La
paramétrisation coûterait une refonte de `pieces.ts`, `modes.ts` et des 43
fichiers de tests, pour zéro bénéfice sur l'unique installation existante
(décision 4 de la spec).

**La couture est nommée** : `app/src/pieces.ts` est le point **unique** où la
maison entre dans l'application. Le jour où une deuxième maison existe, c'est
le seul fichier à ouvrir.

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
npm test             # 43 fichiers vitest
cd .. && make test   # les 4 tests du package (python3 + PyYAML)
```

**`dist/` est versionné**, et ce n'est pas négociable : le contrat
`nivuus.dev/v1` livre par `git archive HEAD`, donc seuls les fichiers suivis
voyagent. Toute modification de `app/src/` doit être suivie d'un
`npm run build` et d'un commit de `dist/` — `make test` le vérifie
(`test_dist_a_jour`).
````

- [x] **Step 2: Écrire le `CLAUDE.md`**

```markdown
# home-desk — notes d'implémentation

## Chemins critiques

- Le hook dépose dans `/opt/nivuus/home-manager/config`, **créé par le socle**.
  Il refuse si ce répertoire est absent plutôt que de créer un orphelin.
- `config/www/` et `config/packages/` sont **partagés**. Onze occupants mesurés
  dans le premier au 2026-09-04, le fragment d'intents de `home-stock` dans le
  second. Le hook ne remplace jamais ces répertoires — seulement
  `www/wallpanel/`, et il **copie** le fichier `packages/home_desk.yaml`.

## Décisions à ne pas défaire

- **`dist/` est versionné.** Le contrat livre par `git archive HEAD` ; un build
  à l'installation aurait exigé `apt: [nodejs, npm]` et 115 Mo de
  `node_modules` sur la cible. `dist/` contient aussi ses `assets/`, dupliqués
  depuis `app/assets/` — 411 Ko payés une fois pour que le dépôt se fasse en
  **un seul `replace_tree()` atomique**. `www/wallpanel/` est relu par trois
  clients qui rechargent tout seuls : deux gestes de dépôt y ouvriraient une
  fenêtre.
- **Le hook n'écrit jamais dans `configuration.yaml`**, il signale deux lignes.
  Règle posée par le `PRESERVED` de `home-manager` et reprise par `home-stock`.
- **Pas de hook `activate`.** Le tri topologique ordonne les `install`, **pas**
  les unités `nivuus-package-activate@*` — elles vivent toutes dans
  `multi-user.target.wants` sans ordre garanti entre elles. Un `activate` serait
  au mieux inutile, au pire une course.
- **`home-stock` n'est pas dans `requires.packages`** : dépendance de bus, pas
  d'installation. Le silence que cela produisait est corrigé dans l'application
  par `absenceNommee` (`app/src/pieces.ts`), pas par une ligne de manifeste.
- **Les `id:` des sept automations de `packages/home_desk.yaml` sont ceux de
  production.** Ils fixent l'`entity_id` des entités `automation.*` dans le
  registre ; les changer perdrait l'historique et les traces.
- **`app/src/pieces.ts` est la seule couture vers cette maison.** N'ajoutez
  jamais d'`entity_id` en dur ailleurs : c'est ce qui garde la
  paramétrisation bon marché le jour où elle deviendra utile.

## Génération 1 — morte, et il ne faut pas la réveiller par erreur

Trois pièces **ont l'air vivantes** et ne le sont pas depuis le 2026-08-02 :
`config/.storage/lovelace.wallpanel_*` (trois dashboards),
`config/custom_templates/wallpanel.jinja`, et les cinq capteurs
`sensor.wallpanel_hero_*` / `_moment` / `_conseil_meteo` déclarés aux lignes
103-166 de `configuration.yaml`.

Contrôle indépendant : `grep -rn "wallpanel_hero\|wallpanel_moment\|conseil_meteo" app/src/`
ne rend **qu'une occurrence, en commentaire** (`app/src/modes.ts:55`). Aucune
ligne de l'application ne les lit.

Elles **restent au socle** (décision 3) : `home-desk` ne transporte pas de code
mort, et les retirer coûterait une écriture manuelle dans `configuration.yaml`
plus la perte d'un renommage `hero`/`heros` qui ne vit que dans l'entity
registry. Leur retrait est une **dette de `home-manager`**, pas d'ici.

## Style

Scripts de test autonomes lancés par `make test`, pas de pytest, pas de
dépendance hors `python3` + PyYAML — c'est le style du dépôt `installer`. La
suite vitest de l'application a sa propre cible, `make test-app`.
```

- [x] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: la portee, les trois gestes operateur, les decisions a ne pas defaire

Decision 4 : le package est propre a CETTE maison, et il l'ecrit en toutes
lettres. Un package qui se pretend generique et ne l'est pas produit chez un
tiers un ecran d'entites inexistantes, sans message."
```

---

### Task 9 : la bascule en production

Premier passage du hook sur la machine vivante. Tout ce qui précède laissait la maison intacte.

**Files:**
- Modify: `DEPLOY/www/wallpanel/`, `DEPLOY/custom_components/vignette/`, `DEPLOY/packages/home_desk.yaml`

**Interfaces:**
- Consumes: le package complet.
- Produces: la production servie depuis le package.

- [x] **Step 1: Relever l'état de référence**

```bash
D=/opt/nivuus/home-manager/config
sudo -n sha256sum $D/www/wallpanel/wallpanel.js
echo "occupants de www/     : $(sudo -n ls $D/www | wc -l)"
echo "occupants de packages/: $(sudo -n ls $D/packages | wc -l)"
sudo -n ls $D/www
```
Expected: 11 occupants dans `www/`, 1 dans `packages/`. **Noter la liste** — le Step 4 la compare.

- [x] **Step 2: Sauvegarder**

```bash
D=/opt/nivuus/home-manager/config
sudo -n cp -a $D/www/wallpanel $D/www/wallpanel.backup-home-desk-20260904
sudo -n cp -a $D/custom_components/vignette $D/custom_components/vignette.backup-home-desk-20260904
```

- [x] **Step 3: Lancer le hook sur la racine réelle**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
echo '{}' | sudo -n python3 hooks/install.py --phase install --root /
```
Expected: des événements `progress` puis `{"event": "done"}`, code 0.

`vignette:` est déclarée (ligne 491 mesurée) : **aucun** signalement à son sujet.
`packages:` est absente : **le signalement doit apparaître**. C'est ce qui prépare la Task 10.

- [x] **Step 4: Vérifier ce qui a été déposé, et surtout ce qui ne l'a pas été**

```bash
D=/opt/nivuus/home-manager/config
echo "occupants de www/      : $(sudo -n ls $D/www | wc -l)   (attendu 12 : les 11 + la sauvegarde du Step 2)"
echo "occupants de packages/ : $(sudo -n ls $D/packages | wc -l)   (attendu 2)"
sudo -n ls $D/packages
echo -n "fragment depose  : "; sudo -n test -f $D/packages/home_desk.yaml && echo oui || echo NON
echo -n "intents intacts  : "; sudo -n test -f $D/packages/home_stock_intents.yaml && echo oui || echo NON
echo -n "pages d'entree   : "; sudo -n ls $D/www/wallpanel/*.html | wc -l
sudo -n sha256sum $D/www/wallpanel/wallpanel.js
```
Expected: 12 occupants dans `www/`, 2 dans `packages/`, le fragment déposé, **les intents de `home-stock` intacts**, 3 pages, et le sha256 identique à celui du Step 1.

- [x] **Step 5: Contrôler les trois tablettes**

```bash
# Recharger la page de chaque tablette depuis Home Assistant.
# Via l'interface : Outils de developpement > Actions > button.press sur
#   button.tablette_salon_load_start_url
#   button.tablette_bureau_load_start_url
#   button.tablette_cuisine_load_start_url
# Puis constater le rendu :
#   image.tablette_salon_capture_d_ecran (et les deux autres)
```
Expected: les trois écrans affichent leur pièce, avec les tuiles média
`musique_*`. La cuisine affiche « Garde-manger non installé » **seulement si**
`home_stock` n'est pas chargé — sur cette machine il l'est, donc les tuiles
« Recette » et « Courses » sont normales.

- [x] **Step 6: Retirer les sauvegardes une fois le contrôle passé**

```bash
D=/opt/nivuus/home-manager/config
sudo -n rm -rf $D/www/wallpanel.backup-home-desk-20260904
sudo -n rm -rf $D/custom_components/vignette.backup-home-desk-20260904
```

Ne pas exécuter ce step tant que le Step 5 n'a pas montré les trois écrans corrects.

---

### Task 10 : ══ PORTE ══ le fragment chargé, puis le retrait d'`automations.yaml`

**C'est le premier geste de ce plan qui peut dégrader une maison vivante.**
Retirer les sept blocs avant que leur remplaçant ne soit chargé laisse trois
écrans allumés en permanence, sans garde thermique — sur des Fire 7 dont la
WebView meurt déjà toute seule.

L'ordre est **non négociable** : déclarer la ligne → constater les sept
automations chargées → seulement alors retirer les blocs.

**Files:**
- Modify: `DEPLOY/configuration.yaml` (par l'opérateur, une ligne)
- Modify: `DEPLOY/automations.yaml` (retrait de 283 lignes sur 4560)

- [x] **Step 1: Ajouter la ligne à `configuration.yaml`**

Geste **de l'opérateur**, jamais du hook.

```bash
D=/opt/nivuus/home-manager/config
sudo -n cp -a $D/configuration.yaml $D/configuration.yaml.backup-home-desk-20260904
```

Ajouter sous le bloc `homeassistant:` :
```yaml
  packages: !include_dir_named packages
```

Attention à l'indentation : la clé vit **sous** `homeassistant:`, indentée de
deux espaces. Vérifier :
```bash
sudo -n grep -n -A2 -B2 "include_dir_named packages" $D/configuration.yaml
```

- [x] **Step 2: Redémarrer Home Assistant et constater les DEUX fragments chargés**

```bash
sudo -n docker compose -f /opt/nivuus/home-manager/docker-compose.yml restart homeassistant
```

Puis, dans Outils de développement > États, chercher `automation.tablettes` :
```
automation.tablettes_luminosite_adaptative
automation.tablettes_allumage_ecran_presence_jour_nuit_lumieres
automation.tablettes_theme_au_demarrage_ha
automation.tablettes_synchronisation_theme_jour_nuit_resilience_reconnexion
automation.tablettes_theme_clair_au_lever_du_soleil
automation.tablettes_theme_sombre_au_coucher_du_soleil
automation.tablettes_reload_browser_apres_demarrage_ha
```
Expected: **sept** entités, toutes en `on`.

Les phrases vocales de `home-stock` deviennent chargées au même moment : c'est
la même ligne. Le vérifier est un bonus gratuit — leur `intent_script` attendait
depuis le 2026-08-28.

- [x] **Step 3: ══ PORTE ══ Ne pas franchir sans les sept**

Si le compte est inférieur à sept, **arrêter**. Les causes plausibles :
l'indentation de la ligne du Step 1 ; un doublon d'`id` entre le fragment et
`automations.yaml`, que Home Assistant signale dans son journal —

```bash
sudo -n docker compose -f /opt/nivuus/home-manager/docker-compose.yml logs --tail 200 homeassistant | grep -i "duplicate\|packages\|home_desk"
```

Un doublon d'`id` est attendu à ce stade : les sept blocs sont encore dans
`automations.yaml`. Home Assistant charge alors l'une des deux définitions. Ce
n'est pas bloquant tant que les sept entités existent — le Step 4 lève le
doublon.

- [x] **Step 4: Retirer les sept blocs d'`automations.yaml`**

```bash
D=/opt/nivuus/home-manager/config
sudo -n cp -a $D/automations.yaml $D/automations.yaml.backup-home-desk-20260904
sudo -n python3 - <<'PY'
import yaml
p = '/opt/nivuus/home-manager/config/automations.yaml'
blocs = yaml.safe_load(open(p, encoding='utf-8'))
avant = len(blocs)
restants = [b for b in blocs if not str(b.get('alias', '')).startswith('Tablettes')]
print(f"{avant} automations -> {len(restants)} ({avant - len(restants)} retirees)")
assert avant - len(restants) == 7, "le compte n'est pas de sept : ARRETER"
yaml.safe_dump(restants, open(p, 'w', encoding='utf-8'),
               allow_unicode=True, sort_keys=False, width=100)
PY
```
Expected: `121 automations -> 114 (7 retirees)`

- [x] **Step 5: Recharger et vérifier que les sept survivent au retrait**

```bash
sudo -n docker compose -f /opt/nivuus/home-manager/docker-compose.yml restart homeassistant
```

Dans Outils de développement > États, recompter `automation.tablettes` :
Expected: toujours **sept**, toutes en `on`. Elles viennent désormais du
fragment du package.

Contrôle fonctionnel, sur la luminosité adaptative — la plus facile à voir :
```bash
# Outils de developpement > Actions > automation.trigger sur
#   automation.tablettes_luminosite_adaptative
# puis lire number.tablette_salon_screen_brightness
```
Expected: la valeur correspond à la règle (220 si l'éclairement ≥ 150, 130 s'il
est ≥ 30 ou si la lumière de la pièce est allumée, 15 sinon).

- [x] **Step 6: Commit du socle**

`automations.yaml` n'est pas versionné par `home-manager` — c'est de la donnée.
Rien à committer ici ; noter le geste dans le journal de la machine si le dépôt
en tient un.

---

### Task 11 : relever les `startUrl`, puis révoquer les trois jetons

**C'est la seule action irréversible du plan.** Une révocation ne se défait
pas ; on réémet. D'où le relevé, et d'où sa place en fin de plan.

Trois clés `bleuenn_url_*` dans `secrets.yaml`, chacune portant un **JWT de
longue durée** (`exp` 2089, le même sur les trois) et pointant vers l'URL d'un
dashboard Lovelace de la génération 1, périmée depuis le 2026-08-02.
`grep -rl "bleuenn_url"` sur `config/` hors sauvegardes ne trouve **aucun
consommateur** : ces clés ne sont référencées par aucun `!secret`.

Ce que cela ne prouve pas : la `startUrl` de Fully vit **sur les tablettes**,
pas dans Home Assistant.

- [x] **Step 1: Relever la `startUrl` réelle des trois tablettes**

Chaque entrée `fully_kiosk` expose l'URL courante. Dans Outils de développement
> États, lire pour chacune des trois tablettes l'attribut de l'entité
`sensor.tablette_<piece>_current_page` (ou, à défaut, ouvrir l'interface
d'administration de Fully sur l'appareil : Settings > Web Content > Start URL).

Les trois adresses mesurées le 2026-08-06 par `CLAUDE.md` de `data/` :
`/local/wallpanel/<piece>.html`.

Consigner les trois valeurs relevées avant de continuer.

- [x] **Step 2: ══ Décision de sûreté ══**

- Si les trois `startUrl` pointent sur `/local/wallpanel/<piece>.html` :
  la chaîne bleuenn n'est plus la porte d'entrée. **Continuer.**
- Si l'une passe encore par `192.168.0.1:8124/bleuenn-hotword.html` :
  **la corriger d'abord** dans Fully (Settings > Web Content > Start URL →
  `http://192.168.0.1:8123/local/wallpanel/<piece>.html`), redémarrer la
  tablette, constater l'affichage, **puis** continuer. C'est un réglage
  d'appareil, bon marché — ce n'est pas une raison de garder trois jetons
  vivants.

- [x] **Step 3: Retirer les trois clés de `secrets.yaml`**

```bash
D=/opt/nivuus/home-manager/config
sudo -n cp -a $D/secrets.yaml $D/secrets.yaml.backup-home-desk-20260904
sudo -n sed -i '/^bleuenn_url_/d' $D/secrets.yaml
sudo -n grep -c . $D/secrets.yaml
```
Expected: 13 lignes non vides (16 moins les 3).

Rien de `secrets.yaml` ne part dans le dépôt — ni la valeur, ni un gabarit qui
en aurait la forme. Ce fichier n'est ni versionné par le socle, ni dans son
`PRESERVED`, parce qu'il n'est jamais touché du tout.

- [x] **Step 4: Révoquer les jetons dans Home Assistant**

Interface : cliquer sur son nom d'utilisateur (en bas de la barre latérale) >
onglet Sécurité > **Jetons d'accès de longue durée**. Supprimer le ou les
jetons correspondant à la chaîne bleuenn.

Si le nom du jeton ne permet pas de l'identifier avec certitude, **ne pas
deviner** : le JWT relevé dans `secrets.yaml.backup-home-desk-20260904` porte un
`jti` que l'on peut décoder pour confirmer, ou l'on garde le jeton et l'on note
la dette. Révoquer le mauvais jeton couperait autre chose.

- [x] **Step 5: Vérifier que rien n'est cassé**

```bash
sudo -n docker compose -f /opt/nivuus/home-manager/docker-compose.yml restart homeassistant
```
Expected: Home Assistant démarre sans erreur `Secret bleuenn_url_* not found`.
Ce message signifierait qu'un `!secret` référençait bien ces clés et que la
mesure de non-consommation était fausse — dans ce cas, restaurer
`secrets.yaml.backup-home-desk-20260904` et rouvrir la décision 7.

Contrôler ensuite les trois tablettes : `button.tablette_<piece>_load_start_url`
puis `image.tablette_<piece>_capture_d_ecran`.

---

### Task 12 : la dette du socle, et l'archivage de la génération 1

Deux gestes d'hygiène, sur de la matière qui n'appartient pas à `home-desk`.

**Files:**
- Modify: `DEPLOY/custom_templates/wallpanel.jinja` (un commentaire en tête)
- Modify: `DEPLOY/configuration.yaml` (un commentaire au-dessus des lignes 103-166)
- Modify: `packages/home-manager/CLAUDE.md` (la dette consignée)
- Move: `/opt/nivuus/HomeAssistant/data/tools/wallpanel/` → `.../archive/wallpanel-generation1/`

- [x] **Step 1: Dater la mort de `wallpanel.jinja` sur place**

Décision 3 : le fichier reste au socle, et son seul défaut — le piège à
relecture — se ferme à coût nul.

```bash
D=/opt/nivuus/home-manager/config
sudo -n cp -a $D/custom_templates/wallpanel.jinja $D/custom_templates/wallpanel.jinja.backup-home-desk-20260904
```

Insérer en tête de `custom_templates/wallpanel.jinja` :

```jinja
{#
  ═══ CE FICHIER NE SERT PLUS AUX TABLETTES — mesuré le 2026-09-04 ═══

  Ses neuf macros alimentent cinq capteurs (sensor.wallpanel_hero_salon,
  _bureau, _cuisine, sensor.wallpanel_moment, sensor.wallpanel_conseil_meteo)
  qu'AUCUNE ligne de l'application des tablettes ne lit.

  Les tablettes affichent depuis le 2026-08-02 une application dédiée, PAS des
  dashboards Lovelace. Elle vit dans le package `home-desk`.

  Pour remesurer (depuis ~/Projects/Nivuus/packages/home-desk) :
      grep -rn "wallpanel_hero\|wallpanel_moment\|conseil_meteo" app/src/
  Résultat au 2026-09-04 : UNE occurrence, en commentaire, app/src/modes.ts:55.

  Conservé volontairement comme filet de retour arrière (décision 3 de
  docs/superpowers/specs/2026-08-29-package-nivuus-home-desk-design.md du
  package home-desk). Son retrait est une dette de home-manager, pas de
  home-desk : voir le CLAUDE.md de home-manager.
#}
```

- [x] **Step 2: Dater la mort des cinq capteurs dans `configuration.yaml`**

```bash
D=/opt/nivuus/home-manager/config
sudo -n cp -a $D/configuration.yaml $D/configuration.yaml.backup-home-desk-t12-20260904
```

Insérer au-dessus du premier des deux blocs `template:` (vers la ligne 103) :

```yaml
# ═══ CES CINQ CAPTEURS NE SERVENT PLUS AUX TABLETTES — mesuré le 2026-09-04 ═══
#
# sensor.wallpanel_moment, sensor.wallpanel_conseil_meteo et les trois
# sensor.wallpanel_hero_* appellent les macros de
# custom_templates/wallpanel.jinja. AUCUNE ligne de l'application des tablettes
# ne les lit — voir l'en-tête de ce fichier .jinja pour la commande de mesure.
#
# Les tablettes affichent depuis le 2026-08-02 une application dédiée, servie
# depuis www/wallpanel/ par le package `home-desk`.
#
# Conservés comme filet de retour arrière. Leur retrait est une dette de
# home-manager : il coûterait la disparition de cinq entités du registre, dont
# le renommage manuel hero/heros n'est pas reproductible. Ne PAS les retirer
# sans lire cette dette dans le CLAUDE.md de home-manager.
```

- [x] **Step 3: Consigner la dette dans `home-manager`**

Ajouter à `packages/home-manager/CLAUDE.md`, sous « Décisions à ne pas défaire » :

```markdown
## Dette : la génération 1 des tablettes murales

Trois pièces **ont l'air vivantes** et ne le sont plus depuis le 2026-08-02 :

- `config/custom_templates/wallpanel.jinja` (163 lignes, 9 macros) ;
- les deux blocs `template:` de `config/configuration.yaml` (lignes 103-166),
  qui déclarent cinq capteurs `sensor.wallpanel_*` — dont un bloc `trigger:`
  à **16 entités déclencheuses** ;
- les trois dashboards `config/.storage/lovelace.wallpanel_{salon,bureau,cuisine}`.

Mesuré le 2026-09-04 : aucune ligne de l'application des tablettes (package
`home-desk`) ne lit ces capteurs. Les deux premiers portent désormais un
commentaire daté sur place.

**Pourquoi ce n'est pas fait.** Le retrait coûte une écriture manuelle dans
`configuration.yaml` — que ce package protège par son `PRESERVED` et que
`home-stock` a explicitement refusé de s'autoriser — la perte du filet de
retour arrière du 2026-08-02, et la disparition de cinq entités du registre
dont le renommage manuel `hero` / `heros` ne vit **que dans l'entity registry**
et n'est pas reproductible.

**Ce que ce n'est pas** : ce n'est pas une dette de `home-desk`. Un package ne
nettoie pas la maison de quelqu'un d'autre ; c'est de l'hygiène du socle.
```

- [x] **Step 4: Vérifier que le chantier music-assistant est clos**

L'archivage de `tools/wallpanel/` **ne peut pas** se faire avant.

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-manager
grep -c '^- \[x\]' docs/superpowers/plans/2026-09-03-music-assistant.md
grep -c '^- \[ \]' docs/superpowers/plans/2026-09-03-music-assistant.md
sudo -n stat -c '%y' /opt/nivuus/HomeAssistant/data/tools/wallpanel/rooms.py
```

`rooms.py` a été modifié le **2026-09-04 à 08:37** par la Task 12 de ce plan,
et porte deux sauvegardes datées du même jour. Ce répertoire n'est pas de la
matière dormante : c'est un chantier d'autrui en cours.

**Si des cases restent décochées, ARRÊTER cette tâche ici.** Les Steps 1 à 3
sont indépendants et acquis ; l'archivage attend. Le noter comme une suite à
donner.

- [ ] **Step 5: Archiver la génération 1**

Seulement si le Step 4 montre le chantier music-assistant clos.

```bash
T=/opt/nivuus/HomeAssistant/data/tools
sudo -n mkdir -p $T/archive
sudo -n mv $T/wallpanel $T/archive/wallpanel-generation1
sudo -n rm -rf $T/archive/wallpanel-generation1/__pycache__
```

- [ ] **Step 6: Écrire la procédure d'actionnement du filet**

C'est ce qui fait tomber le coût de l'archivage. Créer
`$T/archive/wallpanel-generation1/README.md` :

````markdown
# Génération 1 des tablettes murales — archive

Le générateur Lovelace qui produisait les trois dashboards
`wallpanel-salon|bureau|cuisine`, **morte depuis le 2026-08-02**, date à
laquelle les tablettes sont passées à l'application dédiée (package
`home-desk`).

Archivé le 2026-09-04. `build.py` 132 l., `capture.py` 57 l.,
`components.py` 383 l., `rooms.py` 555 l., `tests/test_components.py` 217 l.,
plus `genere/{salon,bureau,cuisine}.yaml` (525 + 567 + 600 lignes).

## Ce qui la maintient encore vivante côté Home Assistant

Ces trois pièces n'ont **pas** été supprimées, et forment le filet de retour
arrière :

- `config/.storage/lovelace.wallpanel_{salon,bureau,cuisine}` — les trois
  dashboards, déclarés dans `.storage/lovelace_dashboards` avec les `url_path`
  `wallpanel-salon`, `wallpanel-bureau`, `wallpanel-cuisine`, en mode
  `storage`, `show_in_sidebar: false` ;
- `config/custom_templates/wallpanel.jinja` — les neuf macros ;
- `config/configuration.yaml` lignes 103-166 — les cinq capteurs
  `sensor.wallpanel_*`.

## Comment réactionner le filet

1. **Vérifier que les cinq capteurs existent encore** : Outils de développement
   > États, chercher `sensor.wallpanel_`. Cinq entités attendues. Si elles ont
   disparu, restaurer les lignes 103-166 de `configuration.yaml` depuis une
   sauvegarde et redémarrer — attention, le renommage manuel `hero` / `heros`
   dans l'entity registry est à refaire à la main.
2. **Régénérer un dashboard** :
   ```bash
   cd /opt/nivuus/HomeAssistant/data/tools/archive/wallpanel-generation1
   python3 build.py --deploy salon
   ```
3. **Pointer une tablette dessus** : dans Fully Kiosk, Settings > Web Content >
   Start URL → `http://192.168.0.1:8123/wallpanel-salon/default`, puis
   redémarrer l'application.
4. Répéter pour `bureau` et `cuisine`.

## Attention — ce que cette archive a subi après sa mort

`rooms.py` a été **modifié après le 2026-08-02** par deux chantiers qui
traversaient toute la maison, sans rapport avec les tablettes :

- la bascule Music Assistant (2026-09-04 08:37) — `rooms.py` et les trois
  `genere/*.yaml` portent désormais `musique_*` au lieu de
  `ytube_music_player` ;
- un chantier grocy (2026-09-04) — sauvegarde
  `rooms.py.backup-grocy-20260904`.

Les YAML de `genere/` sont donc **plus récents que la mort de la génération 1**
et cohérents avec l'état actuel de la maison. C'est une bonne nouvelle pour le
filet : le regénérer produira des dashboards qui citent les bonnes entités.
````

- [x] **Step 7: Commit de `home-manager`**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-manager
git add CLAUDE.md
git commit -m "docs: la dette de la generation 1 des tablettes murales

Trois pieces ont l'air vivantes et ne le sont plus depuis le 2026-08-02 :
wallpanel.jinja, les cinq capteurs sensor.wallpanel_* de configuration.yaml, et
les trois dashboards .storage. Mesure du 2026-09-04 : aucune ligne de
l'application des tablettes ne les lit.

Elles restent, avec un commentaire date sur place (decision 3 de la spec de
home-desk). Leur retrait est une dette DE CE PACKAGE, pas de home-desk : un
package ne nettoie pas la maison de quelqu'un d'autre."
```

---

## Vérification finale

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk

# 1. Les quatre tests du package
make test NIVUUS_INSTALLER_DIR=$HOME/Projects/Nivuus/packages/installer

# 2. La suite de l'application
make test-app

# 3. Ce que git archive emporterait vraiment
git archive HEAD | tar -t | grep -c '^dist/'
git archive HEAD | tar -t | grep -c '^custom_components/vignette/'
git archive HEAD | tar -t | grep '^packages/'

# 4. Aucun chemin de machine dans ce qui voyage
git archive HEAD | tar -xO 2>/dev/null | grep -c "/opt/nivuus/HomeAssistant" || echo 0

# 5. Le manifeste passe le vrai parseur, et le tri place le socle avant
NIVUUS_INSTALLER_DIR=$HOME/Projects/Nivuus/packages/installer \
  python3 tests/test_manifest_contract.py
```

Attendu : les quatre tests passent ; la suite vitest passe ; `dist/` emporte au
moins 8 fichiers et `custom_components/vignette/` exactement 2 ;
`packages/home_desk.yaml` est présent ; **zéro** occurrence de
`/opt/nivuus/HomeAssistant` ; le tri topologique rend
`["home-manager", "home-desk"]`.

Et sur la machine vivante :

```bash
D=/opt/nivuus/home-manager/config
echo "occupants de www/      : $(sudo -n ls $D/www | wc -l)"
echo "occupants de packages/ : $(sudo -n ls $D/packages | wc -l)"
echo "automations restantes  : $(sudo -n python3 -c "import yaml;print(len(yaml.safe_load(open('$D/automations.yaml'))))")"
echo "cles secretes          : $(sudo -n grep -c . $D/secrets.yaml)"
```

Attendu : 11 occupants dans `www/` (les 11 d'origine, `wallpanel/` étant
remplacé et non ajouté), 2 dans `packages/`, 114 automations, 13 lignes de
secrets.

---

## Ce qui reste à l'opérateur

Cinq gestes, aucun automatisable :

| # | Task | Geste |
|---|---|---|
| 1 | Task 9 Step 5 | contrôle visuel des trois tablettes après la bascule |
| 2 | Task 10 Step 1 | ajout de `packages: !include_dir_named packages` dans `configuration.yaml` |
| 3 | Task 11 Step 1 | relevé de la `startUrl` des trois Fire 7 dans Fully Kiosk |
| 4 | Task 11 Step 4 | révocation des jetons dans l'interface de Home Assistant |
| 5 | Task 12 Step 4 | constat que le chantier music-assistant est clos |

Le geste 2 sert **aussi** au fragment d'intents de `home-stock`, déposé le
2026-08-28 et jamais chargé depuis. Il solde deux dettes d'un coup.

---

## Articulation avec le chantier `music-assistant`

Ce plan et `home-manager/docs/superpowers/plans/2026-09-03-music-assistant.md`
se croisent en deux points. **Le télescopage a déjà eu lieu** — ce n'est pas un
risque à ordonnancer, c'est un fait de départ.

| Point de contact | État mesuré le 2026-09-04 | Conséquence pour ce plan |
|---|---|---|
| **Task 11 de music-assistant** — `pieces.ts` bascule vers `media_player.musique_*` | **Faite.** `src/pieces.ts` porte 36 `musique_*` et zéro `ytube` ; le bundle en production a été reconstruit à 01:01 avec ces entités | La Task 1 de ce plan **importe le résultat**. Rien à rejouer, rien à ordonner. Le commit d'import le nomme |
| **Task 12 de music-assistant** — `rooms.py` bascule les trois dashboards de la génération 1 | **Faite** (`rooms.py` modifié à 08:37), mais le plan porte encore ses cases décochées | La Task 12 de **ce** plan, qui archive `tools/wallpanel/`, est **conditionnée** à la clôture de l'autre plan. Elle est en dernier pour cette seule raison |

**La règle qui évite toute collision future** : `app/src/` appartient désormais
à `home-desk`, et `/opt/nivuus/HomeAssistant/data/tools/wallpanel-app/` devient
un vestige à partir de la Task 1. Tout chantier qui voudra modifier
l'application des tablettes après cette date doit le faire dans
`packages/home-desk/app/`, reconstruire, et committer `dist/` — sans quoi
`test_dist_a_jour` échouera, ce qui est exactement son rôle.
```
