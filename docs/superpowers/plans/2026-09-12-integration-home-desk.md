# Plan 3a — L'intégration détient la vérité

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire `custom_components/home_desk` — une intégration Home Assistant qui détient la configuration des écrans, la valide, et la publie par websocket — sans toucher une ligne de l'application, qui continue de servir ses littéraux.

**Architecture:** Une entrée de configuration « Tablettes murales », une sous-entrée par écran, éditée par un menu à huit sections. Le composant embarque une copie bit-pour-bit de `contrat/` et y lit deux choses : la forme d'un écran (`ecran.schema.json`, reflété en `voluptuous`) et le budget de hauteur (`budget.json`, reflété en Python). Ces deux miroirs sont la dette centrale du plan : ils sont gardés par des **tables de cas partagées** que les deux suites de tests — vitest et pytest — lisent dans le même fichier.

**Tech Stack:** Python 3.13, Home Assistant **2026.9.1** (`ConfigSubentryFlow`, `websocket_api`), `voluptuous`, `pytest` + `pytest-homeassistant-custom-component`. Côté dépôt : `make test` (python3 + PyYAML seulement) et la nouvelle cible `make test-composant`.

**Spec:** `docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`

**Les deux plans qui suivent :** 3b fait lire cette configuration par l'application (démarrage asynchrone, quatre dégradations, `index.html` unique) ; 3c migre les données hors du dépôt et bascule la production. **Ce plan-ci ne touche pas `app/src/`.**

---

## Global Constraints

Copiées de la spec et de `CLAUDE.md`. Les exigences de chaque tâche les incluent implicitement.

- **`contrat/` ne contient JAMAIS de donnée de cette maison** : aucun `entity_id`, aucun nom de pièce, aucune URL, aucun jeton. Cette contrainte vaut aussi pour toute nouvelle fixture qu'on y dépose.
- **`app/src/ecran.ts` est la seule couture vers cette maison.** Ce plan n'y touche pas.
- **Le hook n'écrit jamais dans `configuration.yaml`** — il signale. Règle 4 du hook.
- **Pas de hook `activate`** — le tri topologique n'ordonne pas les unités d'activation.
- **`make test` reste `python3` + PyYAML seulement.** C'est ce qui permet de le lancer sur la cible d'installation, qui n'a ni Node ni pytest. `make test-composant` est une **troisième** cible, jamais fusionnée dans `make test`.
- **`dist/` est versionné** et régénéré par `npm run build` ; `git status` doit être vide après un build.
- **Home Assistant 2026.9.1**, vérifié dans le conteneur `homeassistant` le 2026-09-12. `ConfigSubentryFlow` y expose `async_show_menu`, `async_show_form`, `async_create_entry`, `async_update_and_abort` ; `ConfigFlow.async_get_supported_subentry_types(config_entry) -> dict[str, type[ConfigSubentryFlow]]` ; `ConfigSubentry` porte `data`, `subentry_id`, `subentry_type`, `title`, `unique_id`.
- **Le CLI `ha` a ses commandes WebSocket cassées sur cet hôte** (`aiohttp` manque au python3 système). Les commandes REST fonctionnent. Pour valider une configuration : `docker exec homeassistant python -m homeassistant --script check_config -c /config`.
- **Ne jamais écrire dans `/opt/nivuus/`** depuis ce plan. La mise en production est le plan 3c.
- **Cible ES2021 côté application** : pas de `Array.prototype.at()` dans les fichiers `app/` que ce plan touche (les tests de budget).
- **`make test` se lance APRÈS le commit** : `tests/test_dist_a_jour.py` compare `dist/` au HEAD **commité**.

---

## État réel du dépôt — ce que la spec suppose et qui a changé

La spec a été écrite avant l'exécution des plans 1 et 2. **Trois de ses sections décrivent du travail déjà fait**, et son vocabulaire a bougé. Un implémenteur qui lirait la spec sans ce tableau réécrirait du code existant.

| Ce que la spec dit | L'état réel au 2026-09-12 |
|---|---|
| « `rendreCorps` devient un assembleur » | **Fait** (plan 2, tâche 3). Il parcourt `agencement.zones` par une table clée. |
| « `modePrincipal()` garde ses conditions, perd sa hiérarchie » | **Fait** (plan 2, tâche 2). `CONDITIONS` est une table, la priorité est une liste. |
| « `combien()` lit la donnée » | **Fait** (plans 1 et 2). Il lit `contrat/budget.json` et `hauteurUtile`, et `verifierBudget()` existe déjà pour ce formulaire. |
| `pieces.ts` / `PIECES` | S'appellent **`app/src/ecran.ts`** / **`ECRANS`** depuis le plan 1. |
| « Le build publie `contrat/icones.json` et `contrat/budget.json` » | **Fait.** `contrat/` porte quatre fichiers : `README.md`, `budget.json`, `icones.json`, `ecran.schema.json`. |
| « Invariants vérifiés par le schéma » | **Cinq** sont déjà exprimés, dont les deux invariants croisés du plan 2. |
| `absenceNommee` aux lignes 105, 188, 356, 357 et `maison.ts:88` | **Périmé.** Les vrais numéros vivent dans `CLAUDE.md`, remesurés quatre fois. **Ne recopie jamais un numéro de ligne d'un document sans le remesurer** — c'est la leçon la plus chère de ce chantier. |

**Ce que le plan 2 a légué et que ce plan doit reprendre** (fin de `docs/superpowers/plans/2026-09-12-agencement-donnee.md`) :

1. `recette` est confinée à la cuisine par l'**usage**, pas par la donnée — troisième invariant croisé, à traiter avec le formulaire qui le déclenche (**tâche 7 de ce plan**).
2. Le budget sait chiffrer un ordre de zones que le moteur d'animation n'a pas été mesuré pour rendre (**nommé, pas refermé ici** — c'est du ressort de 3b).
3. `version` n'est ni requis ni lu (**refermé ici**, tâche 8 : c'est la quatrième dégradation).
4. Les fixtures de `app/outils/verifier-rendu.mjs` injectent une entité disparue (**3c**, avec la vérification de rendu).

---

## File Structure

### Ce qui est créé

```
custom_components/home_desk/
├── manifest.json          domain, config_flow: true, dependencies ["http","websocket_api"]
├── const.py               DOMAIN, types de sous-entrée, noms de commandes et d'événement
├── __init__.py            async_setup_entry / async_unload_entry ; enregistre ws + services
├── contrat/               COPIE bit-pour-bit de /contrat — le composant tourne depuis
│   ├── budget.json        config/custom_components/, d'où il ne voit pas le dépôt
│   ├── icones.json
│   └── ecran.schema.json
├── schema.py              miroir voluptuous du schéma JSON + résolution d'un écran
├── budget.py              miroir Python de coutEcran / combien / verifierBudget
├── config_flow.py         ConfigFlow + la sous-entrée « écran » et ses huit sections
├── websocket.py           home_desk/ecran, home_desk/ecrans
├── services.py            exporter / importer
├── services.yaml
└── translations/fr.json

contrat/
├── cas-budget.json        table de cas LUE PAR LES DEUX SUITES (vitest et pytest)
└── cas-schema.json        corpus valide/invalide LU PAR LES DEUX SUITES

tests/
├── test_contrat_embarque.py   (make test) la copie est identique à la source
└── composant/                  (make test-composant, pytest)
    ├── conftest.py
    ├── requirements.txt
    ├── test_schema.py
    ├── test_budget.py
    ├── test_config_flow.py
    ├── test_websocket.py
    └── test_services.py

app/tests/cas-partages.test.ts   vitest lit les mêmes deux tables
```

### Ce qui est modifié

- `hooks/install.py` — un **troisième** arbre possédé, déposé comme `vignette`.
- `tests/test_install_hook.py` — il doit voir le troisième arbre arriver.
- `tests/test_dist_portable.py` — le composant ne doit contenir aucune donnée de cette maison.
- `Makefile` — la cible `test-composant`.
- `contrat/README.md` — les deux nouvelles tables de cas, et ce qu'elles garantissent.
- `CLAUDE.md` — le composant `home_desk` rejoint les décisions à ne pas défaire.
- `.gitignore` — l'environnement virtuel de pytest.

### Ce qui N'EST PAS touché

`app/src/` en entier. `dist/`. `packages/home_desk.yaml`. Les sept automations de production. **Si une tâche te pousse à modifier `app/src/`, c'est que tu as dépassé le périmètre : arrête-toi et signale-le.**

---

## La décision de conception de ce plan : deux miroirs, gardés par des tables partagées

Le composant doit savoir deux choses que l'application sait déjà : **quelle forme a un écran** et **combien de commandes tiennent dans sa hauteur**. Les réécrire en Python, c'est créer deux vérités qui divergeront — exactement ce que la décision 5 de la spec interdit (« Deux contrats partagés, jamais deux copies »).

On ne peut pas partager le *code* entre TypeScript et Python. On peut partager les **cas**.

- `contrat/cas-budget.json` porte une liste de cas `(mode, rangeeAmbiance, zones, hauteurUtile) → (commandes, débordement)`. `app/tests/cas-partages.test.ts` les rejoue contre `combien()`/`verifierBudget()`, `tests/composant/test_budget.py` contre `budget.py`. **Un terme retiré d'un seul côté casse une seule suite** — et c'est précisément le signal qu'on veut.
- `contrat/cas-schema.json` porte un corpus d'écrans synthétiques, chacun marqué valide ou invalide **avec son motif**. `ajv` et `voluptuous` doivent rendre le même verdict sur chacun.

Ces deux fichiers sont la raison d'être de ce plan autant que le composant lui-même. Un cas présent dans une suite et absent de l'autre devient **impossible** : c'est le même fichier.

**Aucune de ces fixtures ne contient de donnée de cette maison.** Elles décrivent des écrans inventés — `sensor.piece_temperature`, `light.piece_lumiere` — et c'est ce qui permet de les publier dans `contrat/`.

---

## Une densité inégale, et assumée

Les tâches 1 à 5, 8 et 9 portent leur code en entier. **Les tâches 6 et 7 donnent un squelette et des champs, pas sept formulaires complets** — et c'est délibéré, pas une économie.

Les champs de ces sept sections **sont déjà écrits**, dans `contrat/ecran.schema.json`. Les recopier ici en `voluptuous` produirait quatre cents lignes qui seraient une troisième définition de la même forme, à côté du schéma JSON et du miroir de la tâche 3 — exactement les « deux copies » que la décision 5 de la spec interdit, avec une de plus. Ce que ces deux tâches spécifient donc en entier, ce sont **les tests** : le réordonnancement et son bord, les deux règles que le schéma ne peut pas porter. Le reste, elles le font lire à sa source.

Si tu implémentes ces tâches et que le schéma ne suffit pas à écrire un formulaire, **c'est une information** : dis-le dans ton rapport. Cela voudrait dire que le contrat publié est incomplet, ce qui vaut mieux d'être su maintenant qu'au plan 3b.

---

## Note sur la méthode, tirée des plans 1 et 2

**Les six défauts réels de ce chantier ont tous été trouvés par MUTATION**, aucun par la lecture : on modifie le code, on regarde si la suite bronche. Une suite verte ne dit rien de sa portée.

Chaque tâche de ce plan se termine donc par une mutation nommée. Si la mutation annoncée ne fait tomber aucun test, **le travail n'est pas fini** — les tests écrits ne gardent pas ce qu'ils prétendent garder. Ce n'est pas une formalité : c'est ce contrôle qui a attrapé un câblage entièrement décâblable sans un seul échec, et une promesse de plan qu'aucun test ne portait.

Deux règles de test qui en découlent, et qui sont non négociables :

- **Jamais `not.toThrow()` ni `toBeGreaterThan(0)` seuls.** Un test qui n'assertit qu'une absence de levée ou une inégalité vague n'assertit rien.
- **Un test négatif assertit son MOTIF**, pas seulement le refus.

---

### Task 1 : Le socle du composant, et le hook dépose un troisième arbre

**Files:**
- Create: `custom_components/home_desk/manifest.json`, `custom_components/home_desk/const.py`, `custom_components/home_desk/__init__.py`
- Modify: `hooks/install.py`, `tests/test_install_hook.py`, `tests/test_dist_portable.py`, `CLAUDE.md`
- Test: `tests/test_install_hook.py` (`make test`)

**Interfaces:**
- Consumes: rien.
- Produces: `custom_components.home_desk.const.DOMAIN = "home_desk"`, `VERSION_CONFIG = 1`, `SOUS_ENTREE_ECRAN = "ecran"`, `WS_ECRAN = "home_desk/ecran"`, `WS_ECRANS = "home_desk/ecrans"`, `EVENEMENT_CHANGEMENT = "home_desk_config_changed"`. `async_setup_entry(hass, entry) -> bool` et `async_unload_entry(hass, entry) -> bool`.

> **La différence d'avec `vignette`, et elle compte.** `vignette` s'active par une ligne `vignette:` dans `configuration.yaml`, que le hook **signale sans jamais l'écrire** (règle 4). `home_desk` porte `config_flow: true` : il s'ajoute depuis l'interface, donc **aucune ligne de `configuration.yaml` ne le concerne**. N'ajoute pas de cinquième signalement au hook — il n'aurait rien à dire, et un message qui demande un geste inutile est un bouton mort en prose.

- [ ] **Step 1 : Écrire le test de dépôt qui échoue**

Dans `tests/test_install_hook.py`, section 2 (« Il depose les trois artefacts aux bons chemins »), renommer le commentaire en « les quatre artefacts » et ajouter, après la ligne `check("vignette", ...)` :

```python
    check("composant home_desk", (config / "custom_components" / "home_desk"
                                  / "manifest.json").is_file(), True)
    check("composant home_desk: const", (config / "custom_components" / "home_desk"
                                         / "const.py").is_file(), True)
```

Et, dans la section 3 (« Les repertoires PARTAGES sont intacts »), vérifier que le composant voisin n'a pas été emporté :

```python
    check("vignette intacte a cote de home_desk",
          (config / "custom_components" / "vignette" / "__init__.py").is_file(), True)
```

- [ ] **Step 2 : Le faire échouer**

```bash
make test 2>&1 | tail -20
```

Attendu : **ÉCHEC** de `test_install_hook`, sur `composant home_desk` — le répertoire n'existe pas encore, donc le hook ne dépose rien.

- [ ] **Step 3 : Écrire le manifeste**

`custom_components/home_desk/manifest.json` :

```json
{
  "domain": "home_desk",
  "name": "Tablettes murales",
  "version": "1.0.0",
  "documentation": "https://github.com/nivuus/home-desk",
  "config_flow": true,
  "dependencies": ["http", "websocket_api"],
  "codeowners": [],
  "requirements": [],
  "iot_class": "local_push"
}
```

> `documentation` pointe vers CE dépôt. C'est la correction déjà faite sur `vignette`, dont le manifeste annonçait un dépôt qui rend 404 : le composant n'a pas de dépôt propre, cette copie **est** l'original.

- [ ] **Step 4 : Écrire les constantes**

`custom_components/home_desk/const.py` :

```python
"""Les noms que ce composant publie, et qui ne doivent exister qu'ici.

Chacun est lu par au moins deux modules. Les ecrire en dur a chaque endroit,
c'est se donner rendez-vous avec une faute de frappe qu'aucun test ne voit :
une commande websocket mal nommee ne leve pas, elle n'est simplement jamais
appelee.
"""

DOMAIN = "home_desk"

# La version de la FORME d'une configuration d'ecran, pas celle du composant.
# L'application refuse net une config dont la version lui est inconnue
# (quatrieme degradation, spec decision 10) : c'est ce nombre qu'elle compare.
# Il n'augmente que si la forme cesse d'etre lisible par la version d'avant.
VERSION_CONFIG = 1

# Le type de sous-entree. Une entree « Tablettes murales », N sous-entrees
# « ecran » — ajouter une quatrieme tablette est la meme operation que pour
# les trois premieres.
SOUS_ENTREE_ECRAN = "ecran"

WS_ECRAN = f"{DOMAIN}/ecran"
WS_ECRANS = f"{DOMAIN}/ecrans"

# Emis sur le bus a chaque ecriture d'une sous-entree, charge utile : le nom de
# l'ecran. C'est ce qui permet a une tablette de se recharger sans sondage.
EVENEMENT_CHANGEMENT = f"{DOMAIN}_config_changed"
```

- [ ] **Step 5 : Écrire le point d'entrée**

`custom_components/home_desk/__init__.py` :

```python
"""Tablettes murales — la configuration des ecrans vit ici, plus dans le bundle.

Ce composant ne cree AUCUNE entite. Il detient une configuration, la valide, et
la publie par websocket. C'est deliberé : une entite par ecran donnerait un etat
a synchroniser, un historique a purger et un registre a migrer, pour une donnee
qui change trois fois par an.
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

__all__ = ["DOMAIN", "async_setup_entry", "async_unload_entry"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Charge l'entree. Le transport et les services arrivent aux taches 8 et 9."""
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Decharge l'entree."""
    return True
```

- [ ] **Step 6 : Faire déposer le troisième arbre par le hook**

Dans `hooks/install.py`, ajouter à `OWNED_TREES` (vers la ligne 62) :

```python
OWNED_TREES = (
    ("dist", "www/wallpanel"),
    ("custom_components/vignette", "custom_components/vignette"),
    ("custom_components/home_desk", "custom_components/home_desk"),
)
```

et, dans le bloc `with exclusive_deposit(config_dir):`, juste après le dépôt de `vignette` :

```python
        emit({"event": "progress", "pct": 60,
              "msg": "Depose de l'integration des tablettes"})
        replace_tree(os.path.join(HERE, "custom_components/home_desk"),
                     os.path.join(config_dir, "custom_components/home_desk"))
```

> Les deux composants sont déposés par `replace_tree` **dans la même transaction** (`exclusive_deposit`). C'est la même raison que pour `www/wallpanel/` : trois clients relisent ce répertoire et rechargent tout seuls, deux gestes de dépôt y ouvriraient une fenêtre.

- [ ] **Step 7 : Le faire passer**

```bash
make test 2>&1 | tail -10
```

Attendu : **VERT**, les quatre scripts.

- [ ] **Step 8 : Interdire à ce composant de porter la maison**

`tests/test_dist_portable.py` vérifie que `dist/` ne transporte rien de cette maison. Le composant mérite la même garde, et pour la même raison : il sera bientôt publiable. Ajoute-y le balayage de `custom_components/home_desk/` avec **les mêmes motifs** que ceux déjà utilisés pour `dist/` — **relis le fichier et reprends sa liste**, ne réinvente pas la tienne, sans quoi deux définitions de « donnée de cette maison » divergeront.

Un cas que la liste existante peut ne pas couvrir et qu'il faut ajouter ici : `home-manager`, `/opt/nivuus`, et l'adresse de l'instance. Le composant tourne **dans** la configuration, il est plus exposé que `dist/`.

- [ ] **Step 9 : Inscrire la décision dans `CLAUDE.md`**

Dans « Décisions à ne pas défaire », après l'entrée sur `vignette` :

```markdown
- **`custom_components/home_desk/` s'active par l'interface, pas par
  `configuration.yaml`.** Il porte `config_flow: true`, contrairement à
  `vignette` qui exige une ligne que le hook signale sans l'écrire. Le hook ne
  signale donc RIEN pour lui : un message qui réclame un geste inutile est un
  bouton mort en prose. Il dépose l'arbre, et c'est tout.
```

- [ ] **Step 10 : Vérifier, committer, puis relancer `make test`**

```bash
git add -A
git commit -m "feat(composant): le socle de l'integration home_desk

Une entree de configuration, aucune entite. Le composant detient une
configuration, la valide et la publie ; une entite par ecran donnerait un
etat a synchroniser et un registre a migrer pour une donnee qui change trois
fois par an.

Il s'active par l'interface (config_flow: true), pas par configuration.yaml
comme vignette — le hook ne signale donc rien pour lui, il depose l'arbre.
Les deux composants partent dans la MEME transaction de depot, pour la meme
raison que www/wallpanel/ : les clients relisent et rechargent seuls."
make test
```

Attendu, **après** le commit : `make test` vert, 4/4.

- [ ] **Step 11 : La mutation**

Retire la ligne `("custom_components/home_desk", "custom_components/home_desk")` d'`OWNED_TREES` **sans** retirer l'appel à `replace_tree`, et relance `make test`.

Attendu : au moins un test tombe. **Si tout reste vert**, `OWNED_TREES` ne sert à rien dans ce fichier et il faut le dire dans ton rapport — c'est une information, pas un échec. Restaure.

---

### Task 2 : `contrat/` embarqué, et gardé identique

**Files:**
- Create: `custom_components/home_desk/contrat/budget.json`, `.../icones.json`, `.../ecran.schema.json`, `tests/test_contrat_embarque.py`
- Modify: `Makefile`, `contrat/README.md`
- Test: `tests/test_contrat_embarque.py` (`make test`)

**Interfaces:**
- Consumes: `contrat/*.json` (plans 1 et 2).
- Produces: `make contrat`, qui recopie les trois fichiers ; et la garantie, tenue par `make test`, que la copie est **octet pour octet** la source.

> **Pourquoi une copie, alors que la décision 5 de la spec dit « jamais deux copies ».** Le composant tourne depuis `config/custom_components/home_desk/`, déposé par `replace_tree`. De là, `../../../contrat/` n'existe pas : le dépôt n'est pas sur la machine. Une copie est donc **structurellement obligatoire**. Ce que la décision 5 interdit, ce sont deux copies qui peuvent **diverger** — et c'est exactement ce que le test de cette tâche rend impossible.
>
> Le précédent est écrit dans `CLAUDE.md` : `dist/` porte ses `assets/`, dupliqués depuis `app/assets/`, « 411 Ko payés une fois » pour que le dépôt soit un seul geste atomique. Même raisonnement, même garde.

- [ ] **Step 1 : Écrire le test qui échoue**

`tests/test_contrat_embarque.py` — reprends l'en-tête et la fonction `check`/`failures` des quatre scripts voisins (`tests/test_dist_portable.py` est le plus court, lis-le d'abord). Le corps :

```python
# Le composant tourne depuis config/custom_components/, d'ou il ne voit pas le
# depot : il DOIT embarquer sa copie du contrat. Ce test est ce qui empeche les
# deux exemplaires de diverger — sans lui, une mesure de hauteur republiee dans
# contrat/budget.json n'atteindrait jamais le formulaire qui refuse une saisie,
# et le composant validerait un ecran que l'application fait deborder.
FICHIERS = ("budget.json", "icones.json", "ecran.schema.json")

source = pathlib.Path(__file__).resolve().parent.parent / "contrat"
embarque = (pathlib.Path(__file__).resolve().parent.parent
            / "custom_components" / "home_desk" / "contrat")

for nom in FICHIERS:
    s, e = source / nom, embarque / nom
    if not e.is_file():
        failures.append(f"{nom}: absent du composant — lancez `make contrat`")
        continue
    if s.read_bytes() != e.read_bytes():
        failures.append(f"{nom}: la copie embarquee DIFFERE de contrat/{nom} — "
                        "lancez `make contrat` et committez le resultat")

# README.md n'est PAS embarque : c'est de la prose pour un lecteur humain du
# depot, pas une donnee que le composant lit. L'embarquer ferait grossir chaque
# depot sans qu'aucune ligne de Python ne l'ouvre.
if (embarque / "README.md").exists():
    failures.append("README.md embarque sans lecteur : retirez-le")
```

> Le message d'échec **dit quoi faire**. Un test qui signale une divergence sans nommer le geste qui la répare fait perdre dix minutes à chaque fois qu'il tombe.

- [ ] **Step 2 : Le faire échouer**

```bash
python3 tests/test_contrat_embarque.py
```

Attendu : **ÉCHEC**, trois fois « absent du composant ».

- [ ] **Step 3 : Écrire la cible `make contrat`**

Dans le `Makefile`, après `test-app` :

```makefile
# Le composant embarque sa copie de contrat/ : depose dans
# config/custom_components/, il ne voit pas le depot. `make test` verifie
# qu'elle est identique a la source (tests/test_contrat_embarque.py).
contrat:
	@mkdir -p $(PACKAGE_DIR)/custom_components/home_desk/contrat
	@for f in budget.json icones.json ecran.schema.json; do \
	    cp $(PACKAGE_DIR)/contrat/$$f \
	       $(PACKAGE_DIR)/custom_components/home_desk/contrat/$$f; \
	done
	@echo "contrat embarque : 3 fichiers"
```

et ajoute `contrat` à la ligne `.PHONY`.

- [ ] **Step 4 : Brancher le test dans `make test`**

Dans la boucle de la cible `test`, ajoute `test_contrat_embarque` à la liste — **en dernier**, après `test_dist_a_jour`.

- [ ] **Step 5 : Le faire passer**

```bash
make contrat && make test 2>&1 | tail -12
```

Attendu : **VERT**, les cinq scripts.

- [ ] **Step 6 : Documenter la copie dans le README du contrat**

Dans `contrat/README.md`, une section :

```markdown
## Ce répertoire est copié dans le composant

`custom_components/home_desk/contrat/` en porte un double **octet pour octet**,
parce que le composant tourne depuis `config/custom_components/` et n'a aucun
chemin vers ce dépôt. `make contrat` le regénère, `make test` refuse de passer
si les deux divergent.

`README.md` n'y est pas : aucune ligne de Python ne l'ouvre.

**Après toute modification d'un fichier de ce répertoire : `make contrat`, et
committez le résultat.** Sans ce geste, la mesure que vous venez de publier
n'atteint pas le formulaire qui s'en sert pour refuser une saisie.
```

- [ ] **Step 7 : Committer, puis relancer `make test`**

```bash
git add -A
git commit -m "feat(contrat): le composant embarque sa copie, gardee identique

Depose dans config/custom_components/, le composant n'a aucun chemin vers ce
depot : la copie est structurellement obligatoire. Ce que la decision 5 de la
spec interdit, ce sont deux copies qui peuvent DIVERGER — c'est ce que le
nouveau script de make test rend impossible.

Meme raisonnement que dist/assets/, duplique depuis app/assets/ pour que le
depot soit un seul geste atomique.

Le message d'echec nomme le geste qui repare (make contrat) : un test qui
signale sans dire quoi faire coute dix minutes a chaque fois qu'il tombe."
make test
```

- [ ] **Step 8 : La mutation**

Change un chiffre de `custom_components/home_desk/contrat/budget.json` (par exemple `gouttiere: 8` → `9`) et relance `make test`.

Attendu : **`test_contrat_embarque` tombe**, avec le message qui nomme `make contrat`. Restaure avec `make contrat`.

---

### Task 3 : Le harnais pytest, et le miroir `voluptuous` du schéma

**Files:**
- Create: `custom_components/home_desk/schema.py`, `contrat/cas-schema.json`, `tests/composant/conftest.py`, `tests/composant/requirements.txt`, `tests/composant/test_schema.py`, `app/tests/cas-schema.test.ts`
- Modify: `Makefile`, `.gitignore`, `contrat/README.md`
- Test: `tests/composant/test_schema.py` (`make test-composant`) et `app/tests/cas-schema.test.ts` (vitest)

**Interfaces:**
- Consumes: `contrat/ecran.schema.json`, `const.VERSION_CONFIG`.
- Produces:
  ```python
  ECRAN: vol.Schema                    # le miroir voluptuous
  def valider(brut: dict) -> dict      # leve vol.Invalid, rend l'ecran normalise
  def motif(err: vol.Invalid) -> str   # "chemin/dans/l/objet: mot-cle"
  ```

- [ ] **Step 1 : Établir la version de `pytest-homeassistant-custom-component`**

**Ne devine pas ce numéro.** Ce paquet épingle une version précise de Home Assistant ; en prendre une qui ne correspond pas à **2026.9.1** fait échouer des tests pour des raisons sans rapport avec ce code. Détermine-la, par exemple :

```bash
pip index versions pytest-homeassistant-custom-component 2>&1 | head -5
```

et vérifie la correspondance dans les notes du paquet. **Écris dans ton rapport la version retenue et comment tu l'as établie.** Si tu n'arrives pas à l'établir, **arrête-toi et signale-le** : un mauvais épinglage ferait perdre plus de temps que la question.

`tests/composant/requirements.txt` :

```
# Epingle une version de Home Assistant. Celle-ci doit correspondre a la 2026.9.1
# du conteneur `homeassistant` de cette maison, verifiee le 2026-09-12 par
#   docker exec homeassistant python -c "from homeassistant.const import __version__; print(__version__)"
# La faire deriver, c'est tester le composant contre une API que la production
# n'a pas. Version etablie le <date> par <methode> — cf. rapport de la tache 3.
pytest-homeassistant-custom-component==<la version etablie>
```

- [ ] **Step 2 : Écrire la cible `make test-composant`**

```makefile
# TROISIEME suite, deliberement separee des deux autres. `make test` doit rester
# lancable sur la cible d'installation, qui n'a ni Node ni pytest ; celle-ci
# exige un environnement virtuel et tire Home Assistant en dependance.
COMPOSANT_VENV := $(PACKAGE_DIR)/.venv-composant

test-composant:
	@test -d $(COMPOSANT_VENV) || $(PYTHON) -m venv $(COMPOSANT_VENV)
	@$(COMPOSANT_VENV)/bin/pip install -q -r $(PACKAGE_DIR)/tests/composant/requirements.txt
	@$(COMPOSANT_VENV)/bin/pytest $(PACKAGE_DIR)/tests/composant -q
```

Ajoute `test-composant` à `.PHONY`, et `.venv-composant/` à `.gitignore`.

Complète aussi le commentaire d'en-tête du `Makefile`, qui annonce « DEUX SUITES, DELIBEREMENT SEPAREES » : il y en a trois, et la raison de la troisième mérite d'y être écrite.

- [ ] **Step 3 : Écrire le corpus partagé**

`contrat/cas-schema.json`. **Aucune donnée de cette maison** : des écrans inventés.

```json
{
  "_source": "Corpus de conformite du schema d'ecran, lu par DEUX suites : app/tests/cas-schema.test.ts (ajv) et tests/composant/test_schema.py (voluptuous). Un cas present dans une suite et absent de l'autre est impossible : c'est le meme fichier. Les ecrans y sont INVENTES — ce repertoire ne porte aucune donnee d'une maison reelle.",
  "_motif": "Pour un cas invalide, `motif` est le chemin de la faute dans l'objet, suivi du mot-cle viole : `/synthese/0/valeur: type`. Les deux validateurs doivent nommer LE MEME endroit. Sans cette exigence, un test negatif passe pour la mauvaise raison — c'est la trouvaille de la relecture finale du plan 1.",
  "minimal": {
    "nom": "Piece",
    "temperature": "sensor.piece_temperature",
    "ambiances": [],
    "commandes": [{"libelle": "Lumiere", "icone": "bulb", "entite": "light.piece"}],
    "synthese": [],
    "extrasMaison": [],
    "sources": [],
    "ouvrants": []
  },
  "cas": [
    {"nom": "l ecran minimal est valide", "valide": true, "ecran": "@minimal"},
    {"nom": "un seuil chaine sous un operateur d ordre est refuse", "valide": false,
     "motif": "/synthese/0/valeur: type",
     "modifie": {"synthese": [{"entite": "sensor.x", "operateur": "<", "valeur": "35", "texte": "x"}]}},
    {"nom": "une hauteur utile absurde est refusee", "valide": false,
     "motif": "/hauteurUtile: minimum",
     "modifie": {"hauteurUtile": 12}},
    {"nom": "une entite sans point est refusee", "valide": false,
     "motif": "/temperature: pattern",
     "modifie": {"temperature": "pas_un_entity_id"}},
    {"nom": "une icone hors vocabulaire est refusee", "valide": false,
     "motif": "/commandes/0/icone: enum",
     "modifie": {"commandes": [{"libelle": "X", "icone": "frigo", "entite": "light.x"}]}},
    {"nom": "un champ inconnu sur un bouton est refuse", "valide": false,
     "motif": "/commandes/0: additionalProperties",
     "modifie": {"commandes": [{"libelle": "X", "icone": "bulb", "entite": "light.x", "couleur": "rouge"}]}},
    {"nom": "blocDefaut voiture sans l objet voiture est refuse", "valide": false,
     "motif": ": required",
     "modifie": {"agencement": {"zones": ["ambiances", "commandes", "blocCentral", "synthese"],
                                "modes": ["defaut"], "modulateurs": [], "blocDefaut": "voiture"}}},
    {"nom": "le mode minuteur sans slots est refuse", "valide": false,
     "motif": ": required",
     "modifie": {"agencement": {"zones": ["ambiances", "commandes", "blocCentral", "synthese"],
                                "modes": ["minuteur", "defaut"], "modulateurs": []}}},
    {"nom": "un agencement incomplet est refuse", "valide": false,
     "motif": "/agencement: required",
     "modifie": {"agencement": {"blocDefaut": "repas"}}},
    {"nom": "un blocDefaut que le rendu ignore est refuse", "valide": false,
     "motif": "/agencement/blocDefaut: enum",
     "modifie": {"agencement": {"zones": ["commandes"], "modes": ["defaut"],
                                "modulateurs": [], "blocDefaut": "previsions"}}},
    {"nom": "des zones sans commandes sont refusees", "valide": false,
     "motif": "/agencement/zones: contains",
     "modifie": {"agencement": {"zones": ["synthese"], "modes": ["defaut"], "modulateurs": []}}}
  ]
}
```

> `"@minimal"` et `modifie` : chaque cas part de `minimal` et y applique ses clés. Écrire dix écrans complets rendrait le fichier illisible et ferait diverger dix copies du même socle. **Le lecteur de chaque suite fait la fusion** — une ligne dans chaque langage.
>
> **Ces onze cas ne sortent pas de nulle part : dix reproduisent des tests qui existent déjà** dans `app/tests/contrat-schema.test.ts`. La tâche consiste à les déplacer là où les deux suites les lisent, pas à les inventer.

- [ ] **Step 4 : Écrire le lecteur côté vitest**

`app/tests/cas-schema.test.ts` : charge `contrat/cas-schema.json`, fusionne chaque cas avec `minimal`, valide par `ajv`, et pour chaque cas invalide **assertit le motif** — pas seulement le refus.

```typescript
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import SCHEMA from '../../contrat/ecran.schema.json';
import CORPUS from '../../contrat/cas-schema.json';

const valider = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);

/** Le motif au format du corpus : `chemin: mot-cle`. C'est la forme que les DEUX
 *  validateurs doivent produire — sans elle, un test negatif passe pour la
 *  mauvaise raison, ce qu'une relecture du plan 1 avait deja trouve une fois. */
const motifs = (erreurs: ErrorObject[]): string[] =>
  erreurs.map((e) => `${e.instancePath}: ${e.keyword}`);

describe('contrat/cas-schema.json — le corpus que les deux suites partagent', () => {
  for (const cas of CORPUS.cas) {
    it(cas.nom, () => {
      const ecran = { ...CORPUS.minimal, ...(cas.modifie ?? {}) };
      const ok = valider(ecran);
      expect(ok, JSON.stringify(valider.errors)).toBe(cas.valide);
      if (!cas.valide) {
        expect(motifs(valider.errors ?? []),
               `motifs rendus : ${JSON.stringify(motifs(valider.errors ?? []))}`)
          .toContain(cas.motif);
      }
    });
  }

  it('le corpus n est pas vide et porte des cas des DEUX signes', () => {
    expect(CORPUS.cas.filter((c) => c.valide).length).toBeGreaterThan(0);
    expect(CORPUS.cas.filter((c) => !c.valide).length).toBeGreaterThan(0);
  });
});
```

> Le dernier test n'est pas décoratif : sans lui, un corpus vidé par erreur laisserait la boucle ne rien exécuter et la suite verte. C'est le défaut « le test qui ne protège rien », déjà rencontré deux fois dans ce chantier.

- [ ] **Step 5 : Le faire échouer côté vitest**

```bash
cd app && npx vitest run tests/cas-schema.test.ts 2>&1 | grep -E "Tests |×" | head
```

Attendu : **ÉCHEC** tant que `contrat/cas-schema.json` n'existe pas, puis, une fois le corpus écrit, **VERT** — le schéma exprime déjà ces onze règles depuis les plans 1 et 2. **Si un cas échoue, c'est ton corpus qui a tort, pas le schéma** : le schéma est gardé par les tests existants de `contrat-schema.test.ts`.

- [ ] **Step 6 : Écrire le miroir `voluptuous`**

`custom_components/home_desk/schema.py`. **Relis `contrat/ecran.schema.json` champ par champ** et reflète-le ; ne travaille pas de mémoire. Ce que tu dois produire :

```python
"""Le miroir voluptuous de contrat/ecran.schema.json.

DEUX validateurs pour une seule forme, et c'est assume : ajv ne tourne pas dans
Home Assistant, voluptuous ne tourne pas dans un navigateur. Ce qui les empeche
de diverger n'est pas la discipline, c'est contrat/cas-schema.json — un corpus
que les DEUX suites rejouent, ou un cas present d'un cote et absent de l'autre
est impossible puisque c'est le meme fichier.

`motif()` rend la faute au format du corpus : `chemin: mot-cle`. Les deux
validateurs doivent nommer le MEME endroit ; sans quoi un test negatif passe
pour la mauvaise raison.
"""
```

- `ECRAN: vol.Schema` — la forme complète, `extra=vol.PREVENT_EXTRA` (le pendant d'`additionalProperties: false`).
- `valider(brut: dict) -> dict` — lève `vol.Invalid`, rend l'écran normalisé.
- `motif(err: vol.Invalid) -> str` — `"/" + "/".join(err.path)` puis `": "` puis le mot-clé.

**La correspondance des mots-clés est la partie délicate**, et le corpus est ce qui la juge : `type`, `minimum`, `pattern`, `enum`, `additionalProperties`, `required`, `contains`. `voluptuous` ne les nomme pas ainsi — c'est à `motif()` de traduire, pas au corpus de s'adapter. Le corpus parle le vocabulaire de JSON Schema parce que c'est lui, le contrat publié.

Les trois invariants croisés (`blocDefaut: voiture` ⇒ objet `voiture` ; mode `minuteur` ⇒ slots non vides ; `agencement` ⇒ ses trois listes) s'écrivent en `vol.All(..., _invariants_croises)` avec une fonction qui lève `vol.Invalid` en positionnant `path` pour que `motif()` rende le même chemin qu'`ajv`.

- [ ] **Step 7 : Écrire le lecteur côté pytest**

`tests/composant/test_schema.py` — même corpus, mêmes assertions, verdict **et** motif :

```python
"""Le miroir voluptuous rend-il le meme verdict qu'ajv, pour le meme motif ?

Ce fichier et app/tests/cas-schema.test.ts lisent le MEME contrat/cas-schema.json.
C'est toute la garantie : deux implementations, un seul jeu de cas.
"""
import json
import pathlib

import pytest
import voluptuous as vol

from custom_components.home_desk.schema import motif, valider

CORPUS = json.loads(
    (pathlib.Path(__file__).resolve().parents[2] / "contrat" / "cas-schema.json")
    .read_text(encoding="utf-8"))


@pytest.mark.parametrize("cas", CORPUS["cas"], ids=lambda c: c["nom"])
def test_le_corpus_rend_le_meme_verdict(cas):
    ecran = {**CORPUS["minimal"], **cas.get("modifie", {})}
    if cas["valide"]:
        valider(ecran)          # ne doit pas lever
        return
    with pytest.raises(vol.Invalid) as capture:
        valider(ecran)
    assert motif(capture.value) == cas["motif"], (
        f"voluptuous nomme {motif(capture.value)!r}, "
        f"le corpus attend {cas['motif']!r}")


def test_le_corpus_porte_des_cas_des_deux_signes():
    """Sans ce test, un corpus vide laisserait la suite verte en n'exercant rien."""
    assert any(c["valide"] for c in CORPUS["cas"])
    assert any(not c["valide"] for c in CORPUS["cas"])
```

`tests/composant/conftest.py` :

```python
"""Harnais commun. `enable_custom_integrations` est ce qui fait voir
custom_components/home_desk a l'instance de test ; sans elle, tous les tests de
flow echouent sur « integration not found », pour une raison sans rapport avec
le code teste."""
import pytest

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield
```

- [ ] **Step 8 : Le faire passer**

```bash
make test-composant
```

Attendu : **VERT**, les onze cas plus les deux gardes. Tant qu'un motif diffère, c'est `motif()` ou le miroir qu'il faut corriger — **jamais le corpus**, qui est déjà validé par `ajv` à l'étape 5.

- [ ] **Step 9 : Documenter le corpus, committer, relancer**

Ajoute à `contrat/README.md` une section « Les deux tables de cas », qui dit ce qu'elles garantissent et **pourquoi elles vivent ici et pas dans l'une des deux suites** : posées dans `app/tests/`, elles seraient invisibles à pytest ; posées dans `tests/composant/`, invisibles à vitest. Ce répertoire est le seul endroit que les deux regardent.

```bash
git add -A
git commit -m "feat(composant): le miroir voluptuous, garde par un corpus partage

Deux validateurs pour une seule forme, et c'est assume : ajv ne tourne pas
dans Home Assistant, voluptuous ne tourne pas dans un navigateur. Ce qui les
empeche de diverger n'est pas la discipline, c'est contrat/cas-schema.json —
un corpus que les DEUX suites rejouent, ou un cas present d'un cote et absent
de l'autre est impossible puisque c'est le meme fichier.

Chaque cas invalide assertit son MOTIF, pas seulement son refus : les deux
validateurs doivent nommer le meme endroit. Un test negatif qui n'assertit que
le refus passe pour la mauvaise raison — trouve une fois au plan 1.

Troisieme cible de test, jamais fusionnee dans make test, qui doit rester
lancable sur la cible d'installation (ni Node, ni pytest)."
make test && make test-composant
```

- [ ] **Step 10 : Les deux mutations**

1. Retire une clé du miroir `voluptuous` (par exemple la contrainte `minimum` sur `hauteurUtile`) et relance `make test-composant`. Attendu : **le cas correspondant tombe**.
2. Vide le tableau `cas` de `contrat/cas-schema.json` et relance **les deux** suites. Attendu : **les deux gardes « des cas des deux signes » tombent**, une dans chaque suite.

Restaure après chacune, et rapporte les deux résultats.

---

### Task 4 : Le miroir Python du budget, et la table de cas partagée

**Files:**
- Create: `custom_components/home_desk/budget.py`, `contrat/cas-budget.json`, `tests/composant/test_budget.py`, `app/tests/cas-budget.test.ts`
- Modify: `contrat/README.md`
- Test: `tests/composant/test_budget.py` et `app/tests/cas-budget.test.ts`

**Interfaces:**
- Consumes: `contrat/budget.json`, et les signatures TypeScript qu'il reflète — vérifiées dans `app/src/modes.ts` le 2026-09-12 :
  ```typescript
  function coutEcran(mode, rangeeAmbiance: boolean, rangees: number,
                     zones: Zone[] = AGENCEMENT_DEFAUT.zones): number
  export function combien(mode, rangeeAmbiance = true,
                          hauteurUtile = BUDGET.hauteurUtileParDefaut,
                          zones: Zone[] = AGENCEMENT_DEFAUT.zones): number
  export function verifierBudget(mode, rangeeAmbiance: boolean, hauteurUtile: number,
                                 zones: Zone[] = AGENCEMENT_DEFAUT.zones): number
  ```
- Produces:
  ```python
  def cout_ecran(mode: str, rangee_ambiance: bool, rangees: int,
                 zones: list[str] | None = None) -> int
  def combien(mode: str, rangee_ambiance: bool = True,
              hauteur_utile: int | None = None,
              zones: list[str] | None = None) -> int
  def verifier_budget(mode: str, rangee_ambiance: bool, hauteur_utile: int,
                      zones: list[str] | None = None) -> int
  ```
  `zones=None` signifie « les quatre du défaut », exactement comme la valeur par défaut TypeScript.

> **C'est ici que ce plan gagne ou perd sa raison d'être.** Le formulaire de la tâche 5 refusera une saisie sur la foi de `verifier_budget`. S'il calcule autre chose que `verifierBudget`, l'intégration refusera des écrans qui tiennent et acceptera des écrans qui débordent — et personne ne le verra avant que la tablette soit au mur.
>
> Le modèle qu'il reflète est **sur-déterminé** : onze restes mesurés dans un vrai navigateur, prédits exactement, et une corroboration indépendante à 630 px avec une mesure du 2026-08-03 sur laquelle rien n'a été calibré. **Traduis, ne réinvente pas.** Une formule qui « donne les mêmes résultats sur les cas testés » a déjà été proposée deux fois dans ce chantier et refusée deux fois : elle oubliait la gouttière de colonne, celle entre rangées, et le plafond dérivé — et **restait verte sur tous les points testés**.

- [ ] **Step 1 : Écrire la table de cas**

`contrat/cas-budget.json`. Les valeurs viennent de `contrat/budget.json` — **calcule-les, ne les recopie pas d'ici**, et vérifie que tu retrouves celles-ci :

```json
{
  "_source": "Table de verite du budget de hauteur, lue par DEUX suites : app/tests/cas-budget.test.ts (TypeScript, app/src/modes.ts) et tests/composant/test_budget.py (Python, custom_components/home_desk/budget.py). Aucune donnee de maison : des modes et des hauteurs, rien d'autre.",
  "_pourquoi": "Le formulaire de l'integration refuse une saisie sur la foi de verifier_budget. S'il calcule autre chose que verifierBudget, il refuse des ecrans qui tiennent et accepte des ecrans qui debordent — et personne ne le voit avant que la tablette soit au mur. Un terme retire d'un seul cote casse UNE des deux suites : c'est exactement le signal qu'on veut.",
  "_zones": "null = les quatre zones du defaut, comme la valeur par defaut des deux implementations.",
  "cas": [
    {"mode": "defaut",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 4, "debordement": 0},
    {"mode": "defaut",   "rangeeAmbiance": false, "zones": null, "hauteurUtile": 585, "commandes": 4, "debordement": 0},
    {"mode": "media",    "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 2, "debordement": 0},
    {"mode": "media",    "rangeeAmbiance": false, "zones": null, "hauteurUtile": 585, "commandes": 4, "debordement": 0},
    {"mode": "cinema",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 2, "debordement": 0},
    {"mode": "voiture",  "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 2, "debordement": 0},
    {"mode": "alerte",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 4, "debordement": 0},
    {"mode": "recette",  "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 4, "debordement": 0},
    {"mode": "menage",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 4, "debordement": 0},
    {"mode": "aeration", "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 4, "debordement": 0},

    {"_note": "minuteur paie son cout depuis le plan 2 : 0 commande PARCE QUE rien ne tient, pas par court-circuit.",
     "mode": "minuteur",  "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 585, "commandes": 0, "debordement": 0},
    {"mode": "minuteur",  "rangeeAmbiance": false, "zones": null, "hauteurUtile": 585, "commandes": 2, "debordement": 0},
    {"_note": "630 px = la mesure historique ecranModeMinuteur du 2026-08-03, que le modele reproduit au pixel sans avoir ete calibre dessus.",
     "mode": "minuteur",  "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 657, "commandes": 2, "debordement": 0},
    {"mode": "minuteur",  "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 500, "commandes": 0, "debordement": 58},

    {"_note": "Le palier intermediaire : une rangee de moins.",
     "mode": "defaut",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 521, "commandes": 2, "debordement": 0},
    {"_note": "La gouttiere entre rangees (10 px) ne se voit qu'ici : 582 px avec, 572 sans.",
     "mode": "defaut",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 577, "commandes": 2, "debordement": 0},
    {"mode": "defaut",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 100, "commandes": 0, "debordement": 336},
    {"mode": "defaut",   "rangeeAmbiance": true,  "zones": null, "hauteurUtile": 2000, "commandes": 4, "debordement": 0},

    {"_note": "Zones omises : le cout tombe de la zone ET de sa gouttiere.",
     "mode": "defaut", "rangeeAmbiance": true,
     "zones": ["ambiances", "commandes", "blocCentral"], "hauteurUtile": 100, "commandes": 0, "debordement": 296},
    {"mode": "defaut", "rangeeAmbiance": true,
     "zones": ["commandes", "blocCentral", "synthese"], "hauteurUtile": 100, "commandes": 0, "debordement": 239},
    {"mode": "defaut", "rangeeAmbiance": true,
     "zones": ["ambiances", "commandes", "synthese"], "hauteurUtile": 100, "commandes": 0, "debordement": 244},
    {"_note": "Pas de zone commandes = pas de commande, quelle que soit la hauteur.",
     "mode": "defaut", "rangeeAmbiance": true,
     "zones": ["ambiances", "blocCentral", "synthese"], "hauteurUtile": 2000, "commandes": 0, "debordement": 0}
  ]
}
```

> Les quatre derniers cas sont ceux que la relecture finale du plan 2 a fait naître, et ils sont **les plus précieux de la table** : ce sont les seuls qu'aucun des trois écrans réels n'exerce, et donc les seuls que le formulaire rencontrera en premier quand quelqu'un réordonnera ses zones depuis Home Assistant.

- [ ] **Step 2 : Écrire le lecteur côté vitest et le faire passer**

`app/tests/cas-budget.test.ts` : charge la table, rejoue chaque cas contre `combien()` et `verifierBudget()`, avec le nom du cas dans le message d'échec. Ajoute la garde de non-vacuité (`cas.length` supérieur à quinze) — sans elle, une table vidée laisserait la suite verte.

```bash
cd app && npx vitest run tests/cas-budget.test.ts 2>&1 | grep -E "Tests |×" | head
```

Attendu : **VERT**. Si un cas échoue, **c'est ta valeur attendue qui est fausse**, pas `combien()` : il est gardé par `app/tests/budget.test.ts`, dont la table de vérité gelée n'a bougé que d'une ligne en deux plans, pour une raison écrite.

- [ ] **Step 3 : Écrire le miroir Python**

`custom_components/home_desk/budget.py`. **Traduis `app/src/modes.ts` ligne à ligne** : `coutEcran` d'abord, puis `combien`, puis `verifierBudget`. Garde les commentaires qui justifient chaque terme — ils datent les mesures, et le Python en a autant besoin que le TypeScript.

Les points où une traduction bâclée se trompe, et que le corpus attrapera :

- `enfants` commence à **1** (« Toute la maison », hors de l'ordre réglable, toujours facturé), pas à 3 ;
- la gouttière de colonne est `gouttiere * (enfants - 1)`, celle entre rangées est `gouttiereCommandes * (rangees - 1)` — **deux gouttières différentes**, 8 px et 10 px ;
- l'étiquette « Ambiance » est un enfant **à part entière** : la rangée d'ambiance ajoute **deux** enfants ;
- `rangees_max` se **dérive** de `commandesParDefaut / tuilesParRangee`, il ne s'écrit pas `2` ;
- `combien` **boucle** de `rangees_max` vers 1 et rend le premier qui tient ; il ne divise pas le reste par la hauteur d'une rangée ;
- le bloc central a **trois** branches : `modesABlocMinuteur`, `modesABlocHaut`, sinon `blocDefaut` ;
- `combien` rend **0** si `zones` ne contient pas `commandes` ;
- `combien` ne lève **jamais** : c'est `verifier_budget` qui porte le verdict.

- [ ] **Step 4 : Écrire le lecteur côté pytest**

`tests/composant/test_budget.py`, paramétré sur la même table, avec la même garde de non-vacuité.

- [ ] **Step 5 : Le faire passer**

```bash
make test-composant
```

Attendu : **VERT**, les vingt-deux cas.

- [ ] **Step 6 : Committer, puis relancer les trois suites**

```bash
git add -A
git commit -m "feat(composant): le miroir Python du budget, garde par la meme table

Le formulaire de l'integration refusera une saisie sur la foi de
verifier_budget. S'il calcule autre chose que verifierBudget, il refuse des
ecrans qui tiennent et accepte des ecrans qui debordent — et personne ne le
voit avant que la tablette soit au mur.

Le modele reflete est SUR-DETERMINE : onze restes mesures dans un vrai
navigateur, predits exactement, et une corroboration a 630 px avec une mesure
du 2026-08-03 sur laquelle rien n'a ete calibre. Traduit, pas reinvente : une
formule approximative a ete proposee deux fois dans ce chantier et refusee
deux fois — elle restait verte sur tous les points testes.

Les quatre cas a zones omises sont les plus precieux de la table : les seuls
qu'aucun ecran reel n'exerce, et donc les premiers que le formulaire
rencontrera."
make test && make test-composant && npm --prefix app test 2>&1 | grep -E "Test Files|Tests "
```

- [ ] **Step 7 : Les trois mutations**

C'est le contrôle qui donne sa valeur à toute la tâche. **Fais les trois, et rapporte chacune.**

1. Retire `+ h.gouttiereCommandes * (rangees - 1)` de `coutEcran` **côté TypeScript**. Attendu : **la suite vitest tombe, pytest reste verte**. C'est la preuve que la table sépare bien les deux implémentations.
2. Retire le terme équivalent **côté Python**. Attendu : **l'inverse**.
3. Dans `budget.py`, fais démarrer `enfants` à 3 au lieu de 1. Attendu : les cas à zones omises tombent, les autres non.

Si l'une des trois laisse les deux suites vertes, **la table ne garde pas ce qu'elle prétend garder** et la tâche n'est pas finie.

---

### Task 5 : L'entrée, la sous-entrée, et la première section du menu

**Files:**
- Create: `custom_components/home_desk/config_flow.py`, `custom_components/home_desk/translations/fr.json`, `tests/composant/test_config_flow.py`
- Modify: `custom_components/home_desk/__init__.py`
- Test: `tests/composant/test_config_flow.py`

**Interfaces:**
- Consumes: `const.DOMAIN`, `const.SOUS_ENTREE_ECRAN`, `const.VERSION_CONFIG`, `schema.valider`, `budget.verifier_budget`.
- Produces: `HomeDeskConfigFlow` (l'entrée unique) et `EcranSubentryFlow` (une sous-entrée par écran). La sous-entrée stocke dans `data` **un écran au format de `contrat/ecran.schema.json`**, `version` comprise — jamais une forme intermédiaire.

> **Une entrée, N sous-entrées.** Une seule entrée « Tablettes murales », et une ligne par écran avec son propre bouton « Configurer ». Ajouter une quatrième tablette est alors **la même opération** que pour les trois premières — c'est tout l'objet du chantier.

- [ ] **Step 1 : Vérifier l'API contre le Home Assistant installé**

**Ne code pas de mémoire.** L'API des sous-entrées est récente et son vocabulaire a bougé d'une version à l'autre. Établis, dans le conteneur de cette maison :

```bash
docker exec homeassistant python -c "
from homeassistant import config_entries as ce
import inspect
print(inspect.getsource(ce.ConfigFlow.async_get_supported_subentry_types))
print([m for m in dir(ce.ConfigSubentryFlow) if m.startswith('async_step')])
print(inspect.signature(ce.ConfigSubentryFlow.async_create_entry))
print(inspect.signature(ce.ConfigSubentryFlow.async_update_and_abort))
"
```

Ce qui est **déjà vérifié** (2026-09-12, HA 2026.9.1) et que tu peux tenir pour acquis :
- `ConfigSubentryFlow` expose `async_show_menu`, `async_show_form`, `async_create_entry`, `async_update_and_abort`, `async_abort`.
- `ConfigFlow.async_get_supported_subentry_types(config_entry) -> dict[str, type[ConfigSubentryFlow]]`.
- `ConfigSubentry` porte `data`, `subentry_id`, `subentry_type`, `title`, `unique_id`.

Ce qui reste à établir : le nom exact des étapes d'entrée (ajout et reconfiguration), et si `async_get_supported_subentry_types` est une méthode de classe ou statique. **Écris dans ton rapport ce que tu as trouvé.** Si l'API diffère de ce qui est écrit ici, **c'est l'API qui a raison** — signale l'écart et suis-la.

- [ ] **Step 2 : Écrire le test de création qui échoue**

`tests/composant/test_config_flow.py` :

```python
"""Les flows, y compris leurs cas d'erreur.

Un flow qui ne teste que son chemin heureux ne teste rien : le seul moment ou
un formulaire compte, c'est quand la saisie est mauvaise.
"""
import pytest
from homeassistant import config_entries, data_entry_flow

from custom_components.home_desk.const import DOMAIN, SOUS_ENTREE_ECRAN, VERSION_CONFIG


async def test_l_entree_se_cree_une_seule_fois(hass):
    """Une seule entree « Tablettes murales » : N tablettes sont N SOUS-entrees.
    Sans ce refus, deux entrees detiendraient deux verites concurrentes."""
    premier = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.flow.async_configure(premier["flow_id"], {})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY

    second = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert second["type"] is data_entry_flow.FlowResultType.ABORT
    assert second["reason"] == "single_instance_allowed"


async def test_un_ecran_qui_deborde_est_REFUSE_avec_son_chiffre(hass, entree):
    """LE test de cette tache. Le formulaire refuse une hauteur ou l'ecran ne
    tient pas, et dit de combien — pas « valeur invalide ». C'est toute la
    raison d'etre de verifier_budget : dire non AU MOMENT DE LA SAISIE, pas
    devant la tablette."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Test", "hauteurUtile": 100})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == "budget_intenable"
    assert "336" in str(resultat["description_placeholders"]), (
        "le formulaire doit dire DE COMBIEN l'ecran deborde, pas seulement qu'il deborde")


async def test_un_ecran_valide_est_accepte_et_porte_sa_version(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Salon d essai", "hauteurUtile": 585})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["data"]["version"] == VERSION_CONFIG, (
        "la version est posee a l'ECRITURE, pas devinee a la lecture")
```

Ajoute à `conftest.py` la fixture `entree`, qui crée l'entrée unique et la rend — les tests de sous-entrée en ont tous besoin.

- [ ] **Step 3 : Le faire échouer**

```bash
make test-composant 2>&1 | tail -15
```

Attendu : **ÉCHEC** — `config_flow.py` n'existe pas, donc le flow ne s'initialise pas.

- [ ] **Step 4 : Écrire le flow**

`custom_components/home_desk/config_flow.py`. L'entrée est **triviale et le reste** : elle ne porte aucune donnée, seulement l'existence de l'intégration et ses sous-entrées.

```python
class HomeDeskConfigFlow(ConfigFlow, domain=DOMAIN):
    """L'entree unique. Elle ne detient RIEN : toute la configuration vit dans
    les sous-entrees, une par ecran. Une seconde entree detiendrait une seconde
    verite, et le transport ne saurait pas laquelle publier."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        self._async_abort_entries_match()          # single_instance_allowed
        return self.async_create_entry(title="Tablettes murales", data={})

    @classmethod
    @callback
    def async_get_supported_subentry_types(cls, config_entry):
        return {SOUS_ENTREE_ECRAN: EcranSubentryFlow}
```

> Le décorateur exact et la forme (`classmethod` ou `staticmethod`) viennent de l'étape 1. **Suis ce que tu as trouvé**, pas ce qui est écrit ici.

`EcranSubentryFlow` porte, pour cette tâche, **la seule section « Identité et budget »** : `nom`, `hauteurUtile`, `note`. Le menu à huit entrées arrive à la tâche 6.

La validation de budget, qui est le cœur :

```python
        deborde = verifier_budget("defaut", rangee_ambiance=True,
                                  hauteur_utile=saisie["hauteurUtile"])
        if deborde:
            return self.async_show_form(
                step_id="user", data_schema=SCHEMA_IDENTITE,
                errors={"hauteurUtile": "budget_intenable"},
                description_placeholders={"debordement": str(deborde)})
```

> **Pourquoi `mode="defaut"` et `rangeeAmbiance=True` ici.** C'est le cas le moins cher : si `defaut` ne tient pas, aucun mode ne tient. Vérifier les neuf modes à la saisie du budget serait prématuré — l'écran n'a pas encore ses tuiles, ses modes ni ses zones. La vérification complète, mode par mode, appartient à la section « Blocs et modes » (tâche 6), quand la donnée existe.

- [ ] **Step 5 : Écrire les traductions**

`translations/fr.json`. `budget_intenable` doit produire une phrase qui **nomme le chiffre** :

```json
{
  "config": {
    "abort": { "single_instance_allowed": "Les tablettes murales sont déjà configurées. Ajoutez un écran depuis l'intégration existante." }
  },
  "config_subentries": {
    "ecran": {
      "error": {
        "budget_intenable": "Cet écran déborde de {debordement} px. Augmentez la hauteur utile, ou retirez une zone dans « Blocs et modes »."
      }
    }
  }
}
```

> « Valeur invalide » aurait fait exactement ce que ce projet s'interdit : signaler un refus sans dire quoi faire. Le chiffre transforme un mur en instruction.

- [ ] **Step 6 : Le faire passer**

```bash
make test-composant
```

Attendu : **VERT**.

- [ ] **Step 7 : Committer et relancer les trois suites**

```bash
git add -A
git commit -m "feat(composant): l'entree unique et la premiere section du menu

Une entree « Tablettes murales » qui ne detient RIEN, et N sous-entrees, une
par ecran : ajouter une quatrieme tablette devient la meme operation que pour
les trois premieres, ce qui est tout l'objet du chantier. Une seconde entree
detiendrait une seconde verite et le transport ne saurait pas laquelle
publier — d'ou le refus single_instance_allowed.

Le formulaire refuse un budget intenable AU MOMENT DE LA SAISIE et dit DE
COMBIEN l'ecran deborde. « Valeur invalide » aurait signale un refus sans
dire quoi faire ; le chiffre transforme un mur en instruction.

Le budget est verifie sur le mode « defaut » seul : c'est le moins cher, donc
le plus permissif. La verification mode par mode appartient a la section
« Blocs et modes », quand la donnee existe."
make test && make test-composant
```

- [ ] **Step 8 : La mutation**

Remplace `verifier_budget(...)` par `0` dans la garde du formulaire, et relance `make test-composant`.

Attendu : **`test_un_ecran_qui_deborde_est_REFUSE_avec_son_chiffre` tombe**. Si la suite reste verte, le formulaire ne valide rien et la tâche n'est pas finie. Restaure.

---

### Task 6 : Les trois sections « liste » du menu

**Files:**
- Modify: `custom_components/home_desk/config_flow.py`, `custom_components/home_desk/translations/fr.json`, `tests/composant/test_config_flow.py`
- Test: `tests/composant/test_config_flow.py`

**Interfaces:**
- Consumes: `EcranSubentryFlow` (tâche 5), `schema.valider`, `contrat/icones.json`.
- Produces: le **squelette de section « liste »** que la tâche 7 réutilise pour les minuteurs :
  ```python
  async def async_step_<section>(self, user_input=None)           # menu : ajouter | choisir
  async def async_step_<section>_element(self, user_input=None)   # formulaire + monter/descendre/supprimer
  ```

Le menu complet d'un écran, tel que la spec le dessine — cette tâche en livre les lignes 2 à 4, la tâche 7 les lignes 5 à 8 :

```
Écran « Salon »
├─ Identité et budget      nom · hauteur utile · note              ← tâche 5
├─ Tuiles de commande      liste : ajouter · modifier · supprimer · monter · descendre
├─ Rangée d'ambiance       même liste                                ← tâche 6
├─ Ligne de synthèse       entité · opérateur · seuil · texte · perso · horsTaches · note
├─ Sources média           nom + 6 jeux d'entités, en sections repliables
├─ Blocs et modes          ordre des zones · bloc central · modes actifs et priorité
├─ Minuteurs               slots + étiquettes proposées               ← tâche 7
└─ Voiture                 7 entités, ou « pas de voiture »
```

> **Trois sections, un seul squelette.** Elles diffèrent par leurs champs, pas par leur forme : même menu, même liste, mêmes quatre gestes. Écris le squelette **une fois** — trois copies divergeraient sur le geste « monter », qui est le seul non trivial.

- [ ] **Step 1 : Écrire les tests du réordonnancement, y compris son bord**

Le chemin heureux de trois formulaires n'apprend rien. Deux choses méritent un test, et la seconde est celle qu'on oublie :

```python
async def test_monter_une_tuile_change_son_rang_et_RIEN_D_AUTRE(hass, entree_peuplee):
    """Monter/descendre plutot qu'un glisser-deposer : HA n'offre pas de
    reordonnancement fiable dans un formulaire de flow (spec, « ennuyeux, sur »).
    Encore faut-il que ce soit vraiment sur — c'est-a-dire que la tuile change
    de rang et que rien d'autre ne bouge."""
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=2, geste="monter")
    apres = _commandes(hass)
    assert [c["libelle"] for c in apres] == [
        avant[0]["libelle"], avant[2]["libelle"], avant[1]["libelle"],
        *[c["libelle"] for c in avant[3:]]]
    # Rien d'autre : ni les champs des tuiles, ni les autres sections.
    assert {c["libelle"]: c for c in apres} == {c["libelle"]: c for c in avant}


async def test_monter_la_PREMIERE_ne_fait_rien_et_ne_leve_pas(hass, entree_peuplee):
    """Le bord. Un index hors bornes sur la premiere ligne est l'erreur la plus
    facile a ecrire et la plus penible a decouvrir : elle ne se voit qu'en
    cliquant, devant le formulaire, sur la seule ligne qu'on ne pense pas a
    essayer. Idem pour « descendre » sur la derniere."""
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=0, geste="monter")
    assert _commandes(hass) == avant
    await _geste(hass, "commandes", index=len(avant) - 1, geste="descendre")
    assert _commandes(hass) == avant
```

Écris `_commandes`, `_geste` et la fixture `entree_peuplee` dans `conftest.py`. `entree_peuplee` porte **un écran inventé à quatre tuiles** — assez pour que « monter la troisième » soit distinguable de « inverser les deux premières », ce qu'un écran à deux tuiles ne permet pas.

- [ ] **Step 2 : Le faire échouer**

```bash
make test-composant 2>&1 | tail -15
```

Attendu : **ÉCHEC** — les sections n'existent pas.

- [ ] **Step 3 : Écrire le squelette, puis les trois jeux de champs**

Les champs de chaque section viennent de `contrat/ecran.schema.json` — **relis-le**, c'est lui le contrat, pas ce plan. `$defs/bouton` pour les tuiles et les ambiances, `$defs/synthese` pour la ligne de synthèse.

**Les sélecteurs :**
- `EntitySelector` filtré par domaine : `light`, `cover`, `lock`, `switch` pour les tuiles ; `sensor`, `binary_sensor`, `todo`, `lock`, `cover` pour la synthèse.
- `icone` : un `SelectSelector` dont les options viennent de **`contrat/icones.json`**, jamais d'une liste écrite à la main — le vocabulaire d'icônes aurait alors deux définitions, et c'est précisément ce que la relecture du plan 1 avait corrigé en générant l'`enum` du schéma depuis ce fichier.
- `operateur` : un `SelectSelector` sur les quatre valeurs du schéma.

**Le piège de `EntreeSynthese`** : c'est une **union discriminée** sur `operateur`. `<` et `>` n'acceptent qu'un `valeur` numérique ; `==` et `!=` acceptent une chaîne ou un nombre. Un formulaire qui offrirait un champ texte unique laisserait saisir `{ operateur: "<", valeur: "35" }` — refusé par le schéma, et le corpus de la tâche 3 porte ce cas exact. Le formulaire doit donc **adapter le champ `valeur` à l'opérateur choisi**, ou refuser en nommant le motif.

- [ ] **Step 4 : Le faire passer, committer, relancer**

```bash
make test-composant
git add -A
git commit -m "feat(composant): les trois sections liste du menu d'un ecran

Tuiles de commande, rangee d'ambiance, ligne de synthese : trois sections, un
seul squelette. Elles different par leurs champs, pas par leur forme — trois
copies divergeraient sur le geste « monter », le seul non trivial.

Monter/descendre plutot qu'un glisser-deposer : HA n'offre pas de
reordonnancement fiable dans un formulaire de flow. Ennuyeux, sur — et teste
comme tel, y compris le BORD : monter la premiere ligne ne fait rien et ne
leve pas. C'est l'erreur la plus facile a ecrire et la plus penible a
decouvrir, parce qu'elle ne se voit qu'en cliquant sur la seule ligne qu'on ne
pense pas a essayer.

Les icones viennent de contrat/icones.json : une liste ecrite a la main
donnerait deux vocabulaires, ce que la relecture du plan 1 avait deja corrige
en generant l'enum du schema depuis ce fichier.

Le champ valeur de la synthese s'adapte a l'operateur : EntreeSynthese est une
union discriminee, et un champ texte unique laisserait saisir un seuil chaine
sous un operateur d'ordre — cas que le corpus partage porte deja."
make test && make test-composant
```

- [ ] **Step 5 : La mutation**

Fais que « monter » sur l'index 0 échange avec le **dernier** élément (le comportement d'un `index - 1` non gardé en Python, où `liste[-1]` est valide et **ne lève pas**).

Attendu : **`test_monter_la_PREMIERE_ne_fait_rien_et_ne_leve_pas` tombe.** Cette mutation n'est pas théorique : c'est le bug que Python écrit tout seul quand on oublie la garde, et il ne lève jamais. Restaure.

---

### Task 7 : Les quatre sections « objet », et les deux règles qui ne tiennent pas dans le schéma

**Files:**
- Modify: `custom_components/home_desk/config_flow.py`, `custom_components/home_desk/translations/fr.json`, `tests/composant/test_config_flow.py`
- Test: `tests/composant/test_config_flow.py`

**Interfaces:**
- Consumes: le squelette de section (tâche 6), `budget.verifier_budget`, `schema.valider`.
- Produces: aucune signature nouvelle. La sous-entrée sait éditer un écran **complet**.

Les quatre dernières lignes du menu : **Sources média**, **Blocs et modes**, **Minuteurs**, **Voiture**.

- [ ] **Step 1 : Écrire les tests des deux règles, et d'elles seules**

Les formulaires de ces quatre sections sont du remplissage de champs. Ce qui mérite un test, ce sont les **deux règles que le schéma ne peut pas porter** :

```python
async def test_le_TROISIEME_invariant_croise_est_refuse_a_la_saisie(hass, entree_peuplee):
    """Legue par le plan 2, nomme et deliberement NON mis dans le schema.

    Une tuile `vue: '#recette'` sur un ecran dont `agencement.modes` ne contient
    pas `recette` : la tuile ouvrirait la vue, le mode ne s'engagerait jamais.
    Un bouton qui a l'air vivant et ne fait rien — exactement le « bouton mort »
    que ce projet s'interdit partout.

    Il n'est pas dans le schema JSON a dessein : le schema juge un ecran FINI,
    le formulaire juge une saisie EN COURS — et lui seul peut proposer le
    remede, ce qu'un if/then JSON Schema ne sait pas faire."""
    ...
    assert resultat["errors"]["base"] == "recette_sans_mode"


async def test_le_budget_est_verifie_MODE_PAR_MODE_et_nomme_le_pire(hass, entree_peuplee):
    """La tache 5 ne verifiait que le mode `defaut`, le moins cher : a ce
    moment-la l'ecran n'avait ni tuiles, ni modes, ni zones. Ici la donnee
    existe enfin, donc la verification peut etre complete.

    Et le refus doit nommer LE MODE le plus couteux, pas seulement un chiffre :
    « cet ecran deborde de 45 px » n'indique pas quoi changer, « le mode
    minuteur deborde de 45 px » si."""
    ...
    assert resultat["errors"]["base"] == "budget_intenable_mode"
    assert "minuteur" in str(resultat["description_placeholders"])
    assert "45" in str(resultat["description_placeholders"])
```

- [ ] **Step 2 : Le faire échouer, puis écrire les quatre sections**

Champs, tous depuis `contrat/ecran.schema.json` :

- **Sources média** — `$defs/source` : un nom et six jeux d'entités. La spec demande des **sections repliables** ; si l'API de flow n'en offre pas dans cette version de HA, une étape par source **est** le repli acceptable — mais dis-le dans ton rapport plutôt que de le taire.
- **Blocs et modes** — `agencement` : `zones` (les quatre, réordonnables par le même geste monter/descendre que la tâche 6), `blocDefaut` (les **trois** valeurs du type, pas cinq — cf. la correction du plan 2), `modes` (multi-sélection **ordonnée**, la priorité d'exclusivité), `modulateurs`.
- **Minuteurs** — la liste des slots et les étiquettes proposées. Réutilise le squelette « liste » de la tâche 6.
- **Voiture** — sept entités, ou la case « pas de voiture ». Décocher doit **retirer l'objet**, pas laisser sept champs vides : le schéma exige l'objet complet dès qu'il existe, et `blocDefaut: voiture` l'exige tout court.

- [ ] **Step 3 : Écrire les deux règles**

Pour `recette_sans_mode`, le message doit dire **pourquoi** la tuile serait inerte **et où** activer le mode — sans quoi il signale sans remédier.

Pour le budget, calcule `verifier_budget` **pour chaque mode de `agencement.modes`**, avec les `zones` saisies, et refuse sur le maximum en nommant son mode.

- [ ] **Step 4 : Le faire passer, committer, relancer**

```bash
make test-composant
git add -A
git commit -m "feat(composant): les quatre sections objet, et les deux regles hors schema

Sources media, blocs et modes, minuteurs, voiture. Les formulaires sont du
remplissage de champs ; ce qui compte, ce sont les deux regles que le schema
ne peut pas porter.

Le TROISIEME invariant croise, legue par le plan 2 : une tuile vue:'#recette'
sur un ecran dont les modes ne contiennent pas recette ouvrirait la vue sans
que le mode s'engage jamais — un bouton qui a l'air vivant et ne fait rien. Il
n'est pas dans le schema a dessein : le schema juge un ecran FINI, le
formulaire juge une saisie EN COURS et lui seul peut proposer le remede.

Le budget est enfin verifie MODE PAR MODE, la ou la donnee existe — la tache 5
ne pouvait juger que « defaut », le moins cher. Le refus nomme le mode le plus
couteux : « cet ecran deborde de 45 px » n'indique pas quoi changer, « le mode
minuteur deborde de 45 px » si.

blocDefaut offre TROIS valeurs, pas cinq : previsions est un mode supprime et
entretien n'est cable que comme repli. Les proposer aurait ouvert le menu
deroulant sur deux choix qui ne produisent rien.

Decocher « voiture » RETIRE l'objet au lieu de laisser sept champs vides : le
schema exige l'objet complet des qu'il existe."
make test && make test-composant
```

- [ ] **Step 5 : Les deux mutations**

1. Retire la garde `recette_sans_mode`. Attendu : **le test du troisième invariant tombe**.
2. Fais vérifier le budget sur `defaut` seulement au lieu de tous les modes. Attendu : **le test mode-par-mode tombe**, parce que `defaut` tient là où `minuteur` déborde.

Restaure après chacune, et rapporte les deux.

---

### Task 8 : Le transport, et la version qui cesse d'être décorative

**Files:**
- Create: `custom_components/home_desk/websocket.py`, `tests/composant/test_websocket.py`
- Modify: `custom_components/home_desk/__init__.py`, `custom_components/home_desk/config_flow.py`
- Test: `tests/composant/test_websocket.py`

**Interfaces:**
- Consumes: `const.WS_ECRAN`, `const.WS_ECRANS`, `const.EVENEMENT_CHANGEMENT`, `const.VERSION_CONFIG`, `schema.valider`.
- Produces : deux commandes websocket et un événement de bus.
  ```
  home_desk/ecran   { "type": "home_desk/ecran", "nom": "salon" }
                    → l'ecran RESOLU ET VALIDE, `version` comprise
                    → erreur `not_found` si le nom n'existe pas
                    → erreur `version_inconnue` si la config stockee est trop recente
  home_desk/ecrans  { "type": "home_desk/ecrans" }
                    → [{ "nom": ..., "titre": ... }, ...]
  home_desk_config_changed  { "nom": "salon" }   a chaque ecriture d'une sous-entree
  ```

> `home_desk/ecrans` n'est pas un confort : c'est ce que l'application affichera quand `?ecran=` est absent ou inconnu — **la première des quatre dégradations**. Sans cette commande, ce cas n'a d'autre issue qu'un mur blanc ou un écran deviné, et les deux sont interdits.

- [ ] **Step 1 : Écrire les tests qui échouent**

`tests/composant/test_websocket.py`. Cinq comportements, et **les trois derniers sont les seuls qui comptent vraiment** :

```python
async def test_ecran_rend_la_configuration_validee(hass, ws_client, entree_peuplee):
    """Le chemin heureux, pour memoire."""


async def test_ecrans_rend_la_liste_pour_la_premiere_degradation(hass, ws_client, entree_peuplee):
    """Sans cette commande, `?ecran=` absent n'a d'autre issue qu'un mur blanc
    ou un ecran devine. Les deux sont interdits (spec, decision 10)."""


async def test_un_nom_inconnu_rend_une_ERREUR_NOMMEE_pas_un_objet_vide(hass, ws_client, entree_peuplee):
    """Un objet vide serait un ecran sans tuiles : l'application le rendrait
    sans savoir qu'elle rend une absence. L'erreur doit se distinguer."""
    ...
    assert reponse["error"]["code"] == "not_found"


async def test_une_version_inconnue_est_REFUSEE_a_la_lecture(hass, ws_client, entree):
    """La quatrieme degradation, cote composant. Une sous-entree ecrite par une
    version FUTURE du composant ne doit pas etre servie a moitie : refus net.

    C'est la dette n.3 leguee par le plan 2 — `version` n'etait ni requis ni
    lu. Elle est refermee ici : posee a l'ECRITURE par le flow, verifiee a la
    LECTURE par le transport."""
    ...
    assert reponse["error"]["code"] == "version_inconnue"


async def test_ecrire_une_sous_entree_emet_l_evenement_avec_le_NOM(hass, entree):
    """La charge utile porte le nom de l'ecran, pas un simple signal : les trois
    tablettes ecoutent le meme bus, et deux d'entre elles n'ont aucune raison
    de se recharger parce que la troisieme a change."""
    evenements = async_capture_events(hass, EVENEMENT_CHANGEMENT)
    ...
    assert evenements[0].data == {"nom": "salon d essai"}
```

- [ ] **Step 2 : Le faire échouer**

```bash
make test-composant 2>&1 | tail -15
```

Attendu : **ÉCHEC** — les commandes ne sont pas enregistrées.

- [ ] **Step 3 : Écrire le transport**

`custom_components/home_desk/websocket.py`, avec `@websocket_api.websocket_command` et `@callback`. Le point délicat :

```python
def _resoudre(sous_entree) -> dict:
    """Rend l'ecran tel que l'application le recevra : valide, `version` comprise.

    VALIDE A LA LECTURE, et pas seulement a l'ecriture. Une sous-entree peut
    avoir ete ecrite par une version anterieure du schema, restauree depuis une
    sauvegarde HA, ou importee par `home_desk.importer` — trois chemins qui ne
    passent pas par le formulaire. Servir sans revalider, c'est faire confiance
    a trois portes dont une seule est gardee.
    """
```

Enregistre les deux commandes dans `async_setup_entry` (`__init__.py`), et émets `EVENEMENT_CHANGEMENT` **à chaque écriture d'une sous-entrée** — par un écouteur de mise à jour de l'entrée, pas par un appel dispersé dans chaque branche du flow, sinon une branche oubliée ne notifierait rien.

- [ ] **Step 4 : Le faire passer, committer, relancer**

```bash
make test-composant
git add -A
git commit -m "feat(composant): le transport websocket, et la version cesse d'etre decorative

home_desk/ecran rend la configuration RESOLUE ET VALIDEE, home_desk/ecrans la
liste — cette derniere n'est pas un confort : c'est ce que l'application
affichera quand ?ecran= est absent ou inconnu, premiere des quatre
degradations. Sans elle, ce cas n'a d'autre issue qu'un mur blanc ou un ecran
devine, et les deux sont interdits.

La validation se fait A LA LECTURE, pas seulement a l'ecriture : une
sous-entree peut venir d'une sauvegarde restauree ou de home_desk.importer,
deux chemins qui ne passent pas par le formulaire. Servir sans revalider,
c'est faire confiance a trois portes dont une seule est gardee.

version n'etait ni requis ni lu — dette n.3 du plan 2, refermee ici : posee a
l'ecriture par le flow, verifiee a la lecture par le transport, refus net si
elle est inconnue.

L'evenement porte le NOM de l'ecran : les trois tablettes ecoutent le meme
bus, et deux n'ont aucune raison de se recharger parce que la troisieme a
change. Il est emis par un ecouteur de mise a jour, pas par un appel disperse
dans chaque branche du flow — une branche oubliee ne notifierait rien."
make test && make test-composant
```

- [ ] **Step 5 : Les deux mutations**

1. Retire la revalidation dans `_resoudre` (rends `sous_entree.data` tel quel). Attendu : **le test de version inconnue tombe**.
2. Fais émettre l'événement sans charge utile (`{}`). Attendu : **le test du nom tombe**.

Restaure après chacune.

---

### Task 9 : `exporter` et `importer` — les `note` redeviennent des commentaires

**Files:**
- Create: `custom_components/home_desk/services.py`, `custom_components/home_desk/services.yaml`, `tests/composant/test_services.py`
- Modify: `custom_components/home_desk/__init__.py`, `custom_components/home_desk/translations/fr.json`, `README.md`
- Test: `tests/composant/test_services.py`

**Interfaces:**
- Consumes: `schema.valider`, `const.DOMAIN`, `const.SOUS_ENTREE_ECRAN`, `const.VERSION_CONFIG`.
- Produces: les services `home_desk.exporter` (écrit `config/home_desk_ecrans.yaml`) et `home_desk.importer` (le relit). **`importer` est aussi l'entrée de la migration du plan 3c.**

> **Le YAML exporté porte les `note` en COMMENTAIRES**, pas en champs. C'est tout l'intérêt : le raisonnement redevient lisible là où on le lit, au-dessus de ce qu'il justifie. Un `note: "..."` au milieu des données serait une chaîne de plus ; un `# ...` au-dessus est ce qu'un humain relit.
>
> C'est aussi la réponse à la régression n°3 que la spec nomme franchement : « le raisonnement quitte le dépôt », les `note` ne sont plus dans `git log`. `exporter` est ce qui permet de les y remettre quand on le décide.

- [ ] **Step 1 : Écrire les tests qui échouent**

```python
async def test_exporter_pose_les_note_en_COMMENTAIRES(hass, entree_peuplee):
    """Un note: au milieu des donnees serait une chaine de plus. Un # au-dessus
    de ce qu'il justifie est ce qu'un humain relit — c'est toute la difference,
    et c'est la raison d'etre de ce service."""
    ...
    assert "# Porte epinglee : la tablette est a l'entree" in texte
    assert "note:" not in texte


async def test_l_aller_retour_est_FIDELE(hass, entree_peuplee):
    """exporter puis importer doit rendre exactement les memes ecrans. Sans ce
    test, la migration du plan 3c perdrait des champs en silence — et on ne le
    verrait qu'apres avoir retire les litteraux du depot, c'est-a-dire trop
    tard pour comparer."""
    avant = _ecrans(hass)
    await hass.services.async_call(DOMAIN, "exporter", blocking=True)
    await _vider(hass)
    await hass.services.async_call(DOMAIN, "importer", blocking=True)
    assert _ecrans(hass) == avant


async def test_importer_un_YAML_invalide_REFUSE_TOUT(hass, entree):
    """Tout ou rien. Un import partiel laisserait la configuration dans un etat
    que personne n'a voulu, et que rien ne nomme — pire qu'un refus."""
```

> Le test d'aller-retour est le plus important des trois : c'est lui qui rend la migration du plan 3c **vérifiable avant** d'être irréversible.

- [ ] **Step 2 : Écrire les services, `services.yaml`, et le faire passer**

`services.yaml` décrit les deux services pour l'interface. Le chemin d'écriture est `hass.config.path("home_desk_ecrans.yaml")` — dans `config/`, comme la spec le demande.

`importer` est **atomique** : il valide **tous** les écrans du fichier avant d'en écrire un seul.

- [ ] **Step 3 : Écrire franchement les cinq régressions dans le `README.md`**

La spec les nomme et demande qu'elles soient écrites « franchement dans le README, pas laissées en silence ». Reprends-les telles quelles : installation neuve muette tant qu'aucun écran n'est configuré ; configuration non versionnée par défaut (elle vit dans `.storage`, donc dans les sauvegardes HA, et `home_desk.exporter` la rattrape **à la demande**) ; le raisonnement quitte le dépôt ; un aller-retour réseau s'ajoute au démarrage ; une dépendance de test lourde entre.

- [ ] **Step 4 : Committer et relancer les trois suites**

```bash
git add -A
git commit -m "feat(composant): exporter et importer, les note redeviennent des commentaires

Le YAML exporte porte les note en COMMENTAIRES, pas en champs : un note: au
milieu des donnees serait une chaine de plus, un # au-dessus de ce qu'il
justifie est ce qu'un humain relit. C'est la reponse a la regression n.3 que
la spec nomme — le raisonnement quitte le depot — et le moyen de l'y remettre
quand on le decide.

L'aller-retour est teste FIDELE. C'est ce qui rend la migration du plan 3c
verifiable AVANT d'etre irreversible : sans ce test, elle perdrait des champs
en silence et on ne le verrait qu'apres avoir retire les litteraux.

importer est atomique : un import partiel laisserait la configuration dans un
etat que personne n'a voulu et que rien ne nomme, pire qu'un refus.

Les cinq regressions de la spec sont ecrites dans le README, franchement."
make test && make test-composant && npm --prefix app test 2>&1 | grep -E "Test Files|Tests "
```

- [ ] **Step 5 : La mutation**

Fais écrire les `note` comme des champs YAML au lieu de commentaires. Attendu : **le premier test tombe** sur `"note:" not in texte`. Restaure.

---

## À la fin de ce plan

- `custom_components/home_desk` existe, se charge, et se configure entièrement depuis l'interface.
- Une entrée, N sous-entrées : **ajouter une quatrième tablette est la même opération que pour les trois premières**.
- Deux commandes websocket et un événement de bus publient la configuration.
- Le schéma et le budget ont chacun **deux implémentations et une seule table de cas** — un terme retiré d'un côté casse une suite, et une seule.
- `version` est posée à l'écriture et vérifiée à la lecture. **Dette n°3 du plan 2 refermée.**
- Le troisième invariant croisé vit dans le formulaire, là où il peut proposer un remède. **Dette n°1 du plan 2 refermée.**
- `make test` (5 scripts), `make test-app` (vitest), `make test-composant` (pytest) : **trois suites, trois raisons d'être**.
- **`app/src/` n'a pas bougé d'une ligne.** Les trois tablettes affichent exactement ce qu'elles affichaient, en servant toujours leurs littéraux.

**Ce que 3b fera :** `demarrer(racine, nomEcran)`, l'écran d'attente, les quatre dégradations, `index.html` unique avec `?ecran=`, et la dette n°2 du plan 2 (le moteur d'animation face à un ordre de zones non mesuré).

**Ce que 3c fera :** l'outil AST jetable, l'export, l'import, la vérification de rendu, le retrait des littéraux **et de l'outil**, la dette n°4 (les fixtures de `verifier-rendu.mjs`), puis les huit gestes de mise en production avec leur retour arrière.
