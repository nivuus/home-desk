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
- **`app/src/ecran.ts` est la seule couture vers cette maison.** N'ajoutez
  jamais d'`entity_id` en dur ailleurs : c'est ce qui garde la
  paramétrisation bon marché le jour où elle deviendra utile.
- **`custom_components/vignette/manifest.json` pointe vers ce dépôt.** Il
  annonçait `github.com/nivuus/vignette`, qui rend 404 (mesuré le 2026-09-05).
  Le composant n'a pas de dépôt propre : cette copie **est** l'original.
- **`custom_components/home_desk/` s'active par l'interface, pas par
  `configuration.yaml`.** Il porte `config_flow: true`, contrairement à
  `vignette` qui exige une ligne que le hook signale sans l'écrire. Le hook ne
  signale donc RIEN pour lui : un message qui réclame un geste inutile est un
  bouton mort en prose. Il dépose l'arbre, et c'est tout.

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

- **Le site d'écriture unique.** Six « portes d'écriture » Home Assistant
  (`_async_update`, `async_update_subentry`, `async_update_and_abort`,
  `async_update_reload_and_abort`, `async_add_subentry`,
  `_async_update_entry` — cette dernière est l'ancêtre privé commun aux
  deux premières citées ci-dessus pour la création/suppression) ne
  peuvent être appelées que depuis `garde_ecran.py`
  (`tests/composant/test_garde_ecran.py::
  test_garde_ecran_est_le_seul_module_a_appeler_une_porte_d_ecriture`,
  table `_PORTES_ECRITURE`). `garde_ecran.persister_si_valide` (mise à
  jour d'une sous-entrée) et `garde_ecran.importer_ecrans` (tâche 9,
  création en masse) sont les deux seuls appelants légitimes.
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

## Dettes connues du composant, reportées au 3b/3c

Relevées en relecture finale de branche — un registre de bord qui ne part
pas avec le dépôt (`.superpowers/`, git-ignoré) ne vaut rien pour la
prochaine tâche :

- **`dist/wallpanel.css:114-115` porte trois IP de tablettes**
  (`192.168.0.159`, `.218`, `.138`, dans un commentaire de mesure Fully
  Kiosk). Aucune garde ne les cherche : `tests/test_dist_portable.py`
  scanne bien `dist/` (`INTERDITS`), mais cette liste ne connaît que deux
  chemins de fichier (`/opt/nivuus/HomeAssistant`, `/home/mallanic`),
  aucune IP. Le littéral `"192.168.0.1"` qu'`INTERDITS_COMPOSANT` porte
  plus bas dans le même fichier ne s'applique QU'à
  `custom_components/home_desk/`, un répertoire différent — et même
  transposé sur `dist/`, il ne matche `.159`/`.138` que par coïncidence de
  préfixe (`"192.168.0.1" in "192.168.0.159"` est vrai), jamais `.218`.
  Dette antérieure à cette branche, à trancher en 3c (un motif
  `192\.168\.0\.\d+`, sur `dist/` cette fois, ou accepter que ces trois IP
  sortent avec `dist/`).
- **Quatre champs racine du contrat n'ont aucune porte de saisie** :
  `aspirateur`, `aspirateurMaison`, `listesTachesExtra`, `delorean`. Les
  trois écrans réels les portent, ils **survivent** à toute édition
  passant par le formulaire (vérifié — aucune section ne les retire), mais
  aucune section ne permet de les CRÉER ou de les MODIFIER depuis Home
  Assistant. Déclarés hors périmètre à la tâche 7 et repris par aucune
  tâche depuis : sans cette ligne, ils disparaissent de la mémoire du
  projet.
- **Une entité inconnue du registre HA devrait donner un avertissement,
  jamais un refus** (décision 7 de la spec citée ci-dessus) — non
  implémenté : le formulaire accepte aujourd'hui n'importe quel
  `entity_id` bien formé (`light.nexiste_pas` y compris) sans même un
  avertissement (`errors={}` et `description_placeholders={}`). Un vrai
  morceau (lecture du registre d'entités HA), reporté au 3b plutôt que
  bâclé en fin de branche.
- **Le préalable sur `app/src/connexion.ts:149-150`**, qui jette
  `error.code` d'une erreur websocket et n'en garde que le `message` :
  bloquant pour toute tâche qui voudrait distinguer les refus HA côté
  application par leur code plutôt que par leur texte. `services.py`/
  `garde_ecran.py` (tâche 9) ne passent jamais par ce chemin (erreurs de
  SERVICE HA, pas de commande websocket) et ne le présupposent pas, mais
  la dette reste ouverte pour la prochaine tâche qui y touchera.

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
