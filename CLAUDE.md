# home-desk — notes d'implémentation

## Chemins critiques

- Le hook dépose dans `/opt/nivuus/home-manager/config`, **créé par le socle**.
  Il refuse si ce répertoire est absent plutôt que de créer un orphelin.
- `config/www/` et `config/packages/` sont **partagés**. Douze occupants mesurés
  dans le premier au 2026-09-05, le fragment d'intents de `home-stock` dans le
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
  par `absenceNommee` (`app/src/ecran.ts`), pas par une ligne de manifeste.
- **Les `id:` des sept automations de `packages/home_desk.yaml` sont ceux de
  production.** Ils fixent l'`entity_id` des entités `automation.*` dans le
  registre ; les changer perdrait l'historique et les traces.
- **`app/src/ecran.ts` est la couture PRINCIPALE vers cette maison, et il
  faut savoir qu'elle n'est pas la seule.** N'ajoutez jamais d'`entity_id`
  en dur ailleurs : c'est ce qui garde la paramétrisation bon marché.
  **Corrigé le 2026-09-13** — cette ligne disait « la SEULE couture », et
  c'était faux ; mesuré sur `app/src/` :

  | | Distincts |
  |---|---|
  | `entity_id` distincts, tous fichiers | **69** |
  | dans `ecran.ts` | **54** (113 occurrences) |
  | apparaissant dans un AUTRE fichier | 30 |
  | dont aussi dans `ecran.ts`, donc emportés avec lui | **15** |
  | **survivraient au retrait des littéraux** | **15** (14 propres à cette maison, plus `sun.sun`) |

  Les quinze vivent dans `rendu/maison.ts` (table `TOUTE_LA_MAISON`),
  `demarrage.ts` (les quatre `calendar.*`, `weather.maison`,
  `input_boolean.mode_invites`, `input_number.duree_minuteur_cuisine`,
  `sun.sun`), `alertes.ts` (les trois `binary_sensor.tablette_*_mouvement`,
  les trois capteurs de présence, le distributeur de croquettes), puis
  `garde-manger.ts`, `rendu/defaut.ts`, `rendu/bandeau.ts`,
  `rendu/nuit.ts`. **Aucune garde ne cherche un `entity_id` dans `app/`** :
  `tests/test_dist_portable.py` ne scanne que `dist/` et
  `custom_components/`. La règle était juste, écrite ici, et gardée zéro
  fois — le motif que ce dépôt a payé douze fois sur la branche 3a. Le
  périmètre est tranché par la spec du 2026-09-12 amendée (objectif 1) :
  la CONFIGURATION D'ÉCRAN part, les listes communes et les capteurs
  d'ambiance restent, nommés.
- **`custom_components/vignette/manifest.json` pointe vers ce dépôt.** Il
  annonçait `github.com/nivuus/vignette`, qui rend 404 (mesuré le 2026-09-05).
  Le composant n'a pas de dépôt propre : cette copie **est** l'original.
- **`custom_components/home_desk/` s'active par l'interface, pas par
  `configuration.yaml`.** Il porte `config_flow: true`, contrairement à
  `vignette` qui exige une ligne que le hook signale sans l'écrire. Le hook ne
  signale donc RIEN pour lui : un message qui réclame un geste inutile est un
  bouton mort en prose. Il dépose l'arbre, et c'est tout.

## Dette rayée — les 49 ordres de zones

Les 49 ordres de zones du contrat (`agencement.zones`, `uniqueItems`,
`commandes` obligatoire) rendent tous, mesuré le 2026-09-13, gardé par
`app/tests/zones-ordres.test.ts`. La liste des zones et la zone obligatoire y
sont **dérivées** de `contrat/ecran.schema.json`, jamais recopiées : une
cinquième zone au schéma fait tomber le test de comptage avec un chiffre, pas
en silence. Les trois écrans réels n'en servent qu'un seul
(`['ambiances', 'commandes', 'blocCentral', 'synthese']`), mais depuis que
l'agencement s'édite depuis Home Assistant, les 48 autres sont atteignables —
c'est ce qui transformait la curiosité en dette (plan 2, n°2).

## `absenceNommee` — les cinq points de passage

Le champ est déclaré sur `Bouton` et sur `EntreeSynthese` (`app/src/ecran.ts`).
Une commande qui le porte n'est jamais filtrée quand son entité est muette :
elle reste, inerte, et affiche son libellé. Cinq endroits le respectent, et
**tous les cinq sont nécessaires** — le plan n'en nommait que trois :

| Fichier | Ce qu'il fait |
|---|---|
| `rendu/corps.ts:417` | le filtre des commandes de la pièce |
| `rendu/corps.ts:425` | le **second** filtre (`recetteOuvrable`), qui reprenait ce que le premier venait de laisser passer |
| `rendu/corps.ts:106` | `ligneSynthese`, qui **sautait** l'entrée |
| `rendu/corps.ts:270` | l'étiquette, appelée **inconditionnellement** depuis |
| `rendu/maison.ts:90` | la tuile « Scanner », qui vit dans `extrasMaison` et n'est **pas** rendue par `corps.ts` |

`interaction.ts` rend l'appui inerte, et `base.css` retire le retour tactile
(`.absent`) : une tuile qui accuse réception d'une action qui n'a pas lieu est
le « bouton mort » que ce projet s'interdit.

## Génération 1 — morte, et il ne faut pas la réveiller par erreur

Trois pièces **ont l'air vivantes** et ne le sont pas depuis le 2026-08-02 :
`config/.storage/lovelace.wallpanel_*` (trois dashboards),
`config/custom_templates/wallpanel.jinja`, et les cinq capteurs
`sensor.wallpanel_hero_*` / `_moment` / `_conseil_meteo` déclarés aux lignes
103-166 de `configuration.yaml`.

Contrôle indépendant : `grep -rn "wallpanel_hero\|wallpanel_moment\|conseil_meteo" app/src/`
ne rend **qu'une occurrence, en commentaire** (`app/src/modes.ts:94`). Aucune
ligne de l'application ne les lit.

Elles **restent au socle** (décision 3) : `home-desk` ne transporte pas de code
mort, et les retirer coûterait une écriture manuelle dans `configuration.yaml`
plus la perte d'un renommage `hero`/`heros` qui ne vit que dans l'entity
registry. Leur retrait est une **dette de `home-manager`**, pas d'ici.

## Style

`make test` reste des scripts de test autonomes, pas de pytest, pas de
dépendance hors `python3` + PyYAML — c'est le style du dépôt `installer`,
et sa raison d'être est de tourner sur la cible d'installation, qui n'a
rien d'autre. **Cette règle est restreinte à `make test`** (décision 8 de
la spec `docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`),
pas supprimée : `custom_components/home_desk/` a apporté une **troisième**
suite, `make test-composant` (`tests/composant/`), qui **est** pytest et
tire `pytest-homeassistant-custom-component` (Home Assistant complet) —
nécessaire pour tester un composant HA, impossible en scripts autonomes.
La suite vitest de l'application garde sa propre cible, `make test-app`.
Relevé en relecture finale de branche : cette règle disait encore
« pas de pytest » sans restriction après que `make test-composant` a été
livré — un nouveau venu en aurait conclu, à tort, que cette troisième
suite viole l'accord de travail.

## Invariants du composant `custom_components/home_desk/`, à connaître avant d'y toucher

Relevé en relecture finale de branche : nulle part ailleurs qu'ici avant
cette section. Les deux premières sont gardées par un test AST
(`ast.walk`, pas une convention qu'on espère respectée) ; les deux
suivantes par une convention de dépôt, sans filet automatique :

- **Le site d'écriture unique.** Sept « portes d'écriture » Home Assistant
  (`_async_update`, `async_update_subentry`, `async_update_and_abort`,
  `async_update_reload_and_abort` — les QUATRE portes de MISE A JOUR —,
  `async_add_subentry` et `async_remove_subentry` — les DEUX portes de
  CRÉATION/SUPPRESSION —, et `_async_update_entry`, l'ancêtre privé
  COMMUN de ces deux dernières, jamais des quatre premières) ne peuvent
  être appelées que depuis `garde_ecran.py`
  (`tests/composant/test_garde_ecran.py::
  test_garde_ecran_est_le_seul_module_a_appeler_une_porte_d_ecriture`,
  table `_PORTES_ECRITURE`). `garde_ecran.persister_si_valide` (mise à
  jour d'une sous-entrée) et `garde_ecran.importer_ecrans` (tâche 9,
  création en masse) sont les deux seuls appelants légitimes. Relevé en
  relecture finale de branche (deuxième ronde) : cette section (première
  ronde) omettait purement et simplement `async_remove_subentry` de son
  compte (« Six » portes listées, aucune n'étant celle-ci) — un appel
  direct à cette porte, PAR SON PROPRE NOM, hors de `garde_ecran.py` ne
  tombait sur AUCUN test (mesuré : absente aussi de `_PORTES_ECRITURE`
  dans le code, pas seulement de cette phrase). Corrigée aux deux
  endroits.
- **`formulaire.py` est le seul module autorisé à appeler
  `async_show_form(..., data_schema=...)`**
  (`tests/composant/test_config_flow.py::
  test_formulaire_est_le_seul_module_a_appeler_async_show_form_avec_un_data_schema`) :
  un formulaire construit ailleurs échapperait à la mise en page commune.
- **Le corpus partagé `contrat/cas-budget.json` et `contrat/cas-schema.json`**,
  lu par DEUX suites chacun (`app/tests/cas-*.test.ts` en TypeScript/ajv,
  `tests/composant/test_budget.py`/`test_schema.py` en Python/voluptuous) :
  un cas présent d'un côté et absent de l'autre est impossible, c'est le
  même fichier. Voir `contrat/README.md`.
- **Après toute modification d'un fichier de `contrat/` : `make contrat`,
  et committez le résultat.** Sans ce geste, `custom_components/home_desk/
  contrat/` (la copie embarquée, lue par `schema.py` en production) reste
  périmée — `make test` refuse de passer si les deux divergent, mais rien
  n'empêche d'oublier la régénération avant de lancer `make test`.
- **La couture par laquelle `schema.py` se dégonfle quand il atteint 500
  lignes** — deux fois empruntée, et c'est la même : ce qui **nomme** une
  faute est parti dans `fautes.py` (hiérarchie `_Faute*` et `motif()`), ce
  qui la **lève** dans `validateurs.py` (les fabriques feuilles). Reste
  dans `schema.py` ce qui **miroite** le contrat, et lui seul le lit —
  `validateurs.py` ne contient aucun `pathlib.Path`, aucun JSON, ce qui
  évite la dépendance circulaire. La prochaine extraction suit la même
  ligne ; ne coupez pas à un nombre de lignes.

## Dettes connues du composant, reportées au 3b/3c

Relevées en relecture finale de branche — un registre de bord qui ne part
pas avec le dépôt (`.superpowers/`, git-ignoré) ne vaut rien pour la
prochaine tâche.

**Toutes ont été tranchées le 2026-09-13** dans
`docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`
(section « Amendements du 2026-09-13 ») : les quatre champs racine
deviennent éditables (trois en 3b, `aspirateurMaison` en 3c), le préalable
`connexion.ts` se règle en transportant le `code` du refus, et les IP des
tablettes partent avec le lot de portabilité du 3c. Cette section reste ici
comme CONSTAT mesuré ; la spec porte la décision.

- **Fermée à la tâche 5 du plan 3c, complétée en ronde de relecture 1.**
  Cette entrée constatait que les trois IP de tablettes
  (`192.168.0.159`/`.218`/`.138`) apparaissaient à quatre endroits sans
  qu'aucune garde ne les cherche : `app/`, la SOURCE dont `dist/` est bâti,
  n'était scanné par rien, et le littéral `"192.168.0.1"`
  d'`INTERDITS_COMPOSANT` (`tests/test_dist_portable.py`) ne s'appliquait
  qu'à `custom_components/home_desk/` et n'attrapait `.159`/`.138` que par
  coïncidence de préfixe, jamais `.218`. Retiré des quatre fichiers
  (`app/src/styles/base.css`, `app/outils/verifier-rendu.mjs`,
  `app/README.md`, et le mot de passe Fully Kiosk en clair trouvé au
  passage dans `app/docs/superpowers/plans/
  2026-08-06-bandeau-mise-en-page.md`), en conservant le savoir que ces
  commentaires portaient (deux moteurs Chrome distincts sur les trois
  tablettes, `dvh` absent sur l'un).

  **La première passe s'arrêtait juste avant un fichier qui violait la
  règle.** `SCANNES` ne couvrait que `app/src`, `app/outils`,
  `app/scripts`, `app/gabarits` et `app/README.md` — `app/docs/`, pourtant
  livré par `git archive HEAD` au même titre que `app/README.md`, restait
  hors du filet, et une IP de tablette avait survécu juste à côté du mot
  de passe retiré, sur la même ligne 592 de `2026-08-06-bandeau-mise-en-page.md`.
  Étendre `SCANNES` à `app/docs` a aussi mis au jour, non nommés par la
  mesure initiale : quatre chemins morts `/opt/nivuus/HomeAssistant/...`
  (disparu le 2026-08-28) dans ce même fichier et dans
  `2026-08-22-mouvement-grammaire.md` — dont un mode opératoire encore
  actionnable qui lit `HA_TOKEN` sur un chemin mort depuis six semaines —,
  et trois IP supplémentaires (`192.168.0.1`, la passerelle du Grocy
  local, pas une tablette) dans trois specs/plans de la fonctionnalité
  recette/scan. Même traitement partout : le fait reste, l'identifiant
  part, la date de retrait est dite.

  `tests/test_portabilite_app.py`, ajouté à la boucle de `make test`,
  scanne `app/src`, `app/outils`, `app/scripts`, `app/gabarits`,
  `app/README.md` et `app/docs` par MOTIF (jamais par littéral) et referme
  le filet sur ce périmètre : une IP, un chemin personnel ou un mot de
  passe en clair qui y réapparaîtrait ferait échouer `make test`, pas
  seulement une relecture. **Laissé hors de `SCANNES`, à dessein, et donc
  hors filet** : `app/tests/` (sa propre suite vitest) et les fichiers à
  la racine d'`app/` (`package.json`, `package-lock.json`,
  `rollup.config.js`, `tsconfig.json`, `vitest.config.ts`, `app/assets/`)
  — vérifiés sans trace de cette machine au 2026-09-14, mais une
  régression future n'y serait pas détectée automatiquement.
- **Au-delà des IP, `dist/wallpanel.js` embarque la configuration
  littérale COMPLÈTE de cette maison** — mesuré : 69 `entity_id` distincts
  (`grep -oE '"[a-z_]+\.[a-z0-9_]+"' dist/wallpanel.js | sort -u | wc -l`),
  serrure (`lock.aqara_smart_lock_u200_lite`), rideaux, deux aspirateurs
  (`vacuum.aspirateur_chambre`/`_cuisine`), quatre `media_player`, toutes
  les entités de la voiture (`sensor.peugeot_e208_*`,
  `binary_sensor.peugeot_e208_*`, `button.peugeot_e208_*`)... Par le
  critère que cette branche s'applique À ELLE-MÊME en retirant
  `sensor.home_stock_next_meal` des TESTS (une entité réelle n'a rien à
  faire hors d'`app/src/ecran.ts`) — voir les trois petites choses
  ci-dessous — c'est la MÊME dette, cent fois plus grosse : `dist/` est un
  bundle COMPILÉ depuis `app/src/ecran.ts`, la couture principale vers
  cette maison (décision ci-dessus, corrigée : elle n'est pas la seule,
  quinze `entity_id` vivent ailleurs) ; le distribuer, c'est distribuer
  cette maison. Non nommée ailleurs avant cette ligne. Aucune décision de
  trancher n'est prise ici — seulement le constat, pour que la prochaine
  tâche qui touche à `dist/` ou à la portabilité du dépôt le trouve.
- **Fermée, plan 3c tâche 1 : `aspirateurMaison`, le quatrième champ racine,
  avait sa porte de saisie manquante — corrigée dans cet ordre précis, parce
  que l'ordre était le piège.** D'abord le littéral : `rendu/maison.ts`
  comparait `b.entite === 'vacuum.aspirateur_cuisine'` pour décider si
  `piece.aspirateurMaison` remplace la tuile générique « Aspirateur » de la
  vue « Toute la maison » — un second endroit qui recopiait le même fait que
  la table `TOUTE_LA_MAISON`, à quinze lignes de distance, sans lien entre
  les deux. L'entrée est désormais nommée (`export const
  ASPIRATEUR_GENERIQUE: Bouton`) et comparée par IDENTITÉ, jamais par sa
  valeur d'entité. Ensuite seulement le formulaire :
  `custom_components/home_desk/objets.py` (`SectionsObjetMixin.
  async_step_aspirateur_maison`, calqué sur `async_step_voiture`) ouvre la
  saisie. Traiter la saisie avant le littéral aurait livré un bouton à demi
  mort — la tuile saisie depuis Home Assistant n'aurait jamais remplacé la
  générique, sans un mot, dès que la table aurait changé d'aspirateur.
- **Une entité inconnue du registre HA donne un avertissement, jamais un
  refus** (décision 7 de la spec citée ci-dessus) — tenue à la tâche 7 :
  `custom_components/home_desk/registre.py` (`entites_inconnues`,
  `entites_dans`) lit le registre ET l'état (une entité créée en YAML ou
  par template répond sans être au registre). **Corrigé en relecture
  finale de branche (I3) : cette entrée comptait « les TROIS câblages »
  (les DEUX entrées de l'identité, `EcranSubentryFlow.async_step_user`/
  `async_step_identite`, et le squelette des sections « liste »,
  `SectionsListeMixin._async_step_section_element`) et omettait le
  QUATRIÈME — exactement la faute que le commit `0bfa8ff` corrigeait par
  ailleurs (`_PORTES_ECRITURE` à qui il manquait `async_remove_
  subentry`).** Le quatrième câblage est la section « objet » `voiture`
  (`SectionsObjetMixin.async_step_voiture`, `objets.py`), ajouté par ce
  même commit et gardé par `tests/composant/test_config_flow_voiture.py`.
  Les quatre calculent la LISTE des entités inconnues et la remplissent
  sans jamais toucher `errors` ; gardés un par un (mutés en relecture de
  tâche 7) par `tests/composant/test_registre.py` et
  `tests/composant/test_config_flow_champs_libres.py`
  (`test_une_entite_inconnue_AVERTIT_au_lieu_de_REFUSER_a_la_creation`,
  `..._en_reconfiguration`, `..._dans_le_squelette_des_sections`).
  **C1 (même ronde de relecture finale) a corrigé un second défaut, sur
  L'AUTRE bout** : ces quatre câblages posaient la liste dans
  `description_placeholders["entites_inconnues"]`, mais AUCUN écran
  réellement atteint ne portait ce placeholder dans sa description — voir
  `registre.avertissement_entites_inconnues` et
  `tests/composant/test_avertissement_entites.py`, qui apparient
  désormais les deux bouts.
- **Fermée, corrigée en relecture finale de branche : cette entrée
  déclarait encore OUVERT le préalable sur `app/src/connexion.ts:149-150`**
  (jeter `error.code` d'une erreur websocket, ne garder que le `message`).
  La tâche 1 l'a fermé : `connexion.ts:27-32` porte `class RefusHA extends
  Error` (le `code` survit, `message` reste accessible par paresse), et
  `envoyerCommande` (`:234-237`) rejette désormais `new RefusHA(m.error?.code
  ?? 'inconnu', m.error?.message ?? ...)` plutôt que de le jeter. C'est la
  fondation de `configuration.ts:39-53` (`PANNE_PAR_CODE`, qui associe
  chaque code — `not_found`, `version_inconnue`, `ecran_corrompu`,
  `unknown_command` — à l'une des cinq dégradations) : sans `RefusHA`, ce
  tableau n'aurait rien à lire. `services.py`/`garde_ecran.py` (tâche 9) ne
  passent toujours pas par ce chemin (erreurs de SERVICE HA, pas de
  commande websocket) et ne le présupposent pas.

## Dette d'environnement connue, à ne pas réparer ici

Sur l'hôte de cette maison, le CLI `ha` a ses commandes **WebSocket** cassées :
`aiohttp` manque au `python3` système, donc `automation trace`,
`automation category`, `dashboard` et `script trace` échouent. Les commandes
**REST** fonctionnent. C'est une dette nommée dans `home-stock` ; on la
contourne (REST, ou `docker exec`), on ne la répare pas ici.

Et le CLI `ha` **n'a pas** de sous-commande `core check` — c'est un wrapper
REST, pas le CLI Supervisor. Pour valider une configuration avant rechargement :

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
```
