# Paramétrer les écrans muraux depuis Home Assistant

*Spec de conception — 2026-09-12*

## Le besoin

> « Plutôt que de faire du code dédié pour chaque tablette, il faudrait pouvoir
> paramétrer l'affichage de chaque tablette depuis HA. »

Deux objectifs, retenus tous les deux (arbitrage du propriétaire, 2026-09-12) :

1. **Portabilité** — plus aucun `entity_id` de cette maison dans le dépôt.
   C'est l'annulation explicite de la décision 4 de la spec du 2026-08-29 et de
   l'encadré « Ce package est propre à UNE maison » du README.
2. **Édition vivante** — le propriétaire ajoute, retire, réordonne une tuile
   depuis l'interface de Home Assistant, sans TypeScript, sans `npm run build`,
   sans commit de `dist/`, sans redéploiement.

## Ce qu'on construit

Une intégration Home Assistant (`custom_components/home_desk/`) qui détient la
description de chaque écran, et une application qui la lit au démarrage par
websocket au lieu de la porter dans son bundle.

## Ce qu'on ne construit pas

- **Pas un moteur de mise en page libre.** La palette de blocs reste FERMÉE
  (celle qui existe aujourd'hui) ; seul l'agencement s'ouvre. Voir décision 3.
- **Pas un langage de règles.** Les CONDITIONS de chaque mode restent en
  TypeScript. Seuls leur ordre et leur activation deviennent des données.
  Franchir cette frontière, c'est réécrire Lovelace par une autre porte.
- **Pas un retour à la génération 1.** `tools/wallpanel/rooms.py` — 1 127 lignes
  de Python produisant 1 692 lignes de YAML dans trois dashboards Lovelace — a
  été remplacé le 2026-08-02 par cette application. Ce chantier rend la DONNÉE
  configurable, pas le RENDU.

---

## Les mesures qui fondent ce dessin

Relevées le 2026-09-12, sur ce dépôt et sur l'hôte de cette maison.

| Mesure | Valeur | Ce qu'elle décide |
|---|---|---|
| Consommateurs de la donnée `PIECES` dans `src/` | **1** (`src/index.ts:8`) | La couture annoncée par le README existe réellement. Tout le reste de l'app reçoit déjà `piece: Piece` en paramètre. |
| Fichiers de tests qui lisent la donnée `PIECES` | **9 sur 41** (`pieces`, `maison`, `modes`, `corps`, `nuit`, `cochage`, `navigation`, `demarrage`, `orchestration`) | Les 32 autres construisent leurs propres `Piece` littérales et survivent INTACTES si le TYPE survit. C'est l'argument décisif de la décision 1. |
| Version de Home Assistant sur cette maison | **2026.9.1** | `ConfigSubentryFlow` est disponible (vérifié par import). Décide la forme : une entrée, N sous-entrées. |
| Taille de `src/pieces.ts` | 515 lignes, dont ~300 de raisonnement daté | Motive le champ `note` (décision 6) et la reprise automatique des commentaires par l'outil de migration. |
| Palette de modes principaux | 9, exclusifs (`modes.ts`) | Le bloc central est DISPUTÉ à l'exécution, pas placé dans une liste. Décide la forme de l'agencement (décision 3). |
| Budget de hauteur | 585 px, `combien()` rend 0, 2 ou 4 tuiles | Motive `contrat/budget.json` et la validation à la saisie (décision 5). |
| Raison du style « python3 + PyYAML seulement » | `Makefile`, l. 5-8 : *« lancer sur une machine qui n'a rien d'autre, y compris la cible d'installation »* | La règle est restreinte, pas supprimée (décision 8). |

---

## Les décisions

### 1. Le type reste dans le dépôt, la donnée part

`app/src/pieces.ts` se scinde. Les **types** (`Ecran`, `Bouton`,
`EntreeSynthese`, `Voiture`, `DeclarationSource`, et le nouveau `Agencement`)
restent versionnés : ils SONT le contrat. Les trois objets littéraux
disparaissent.

*Pourquoi* : 32 des 41 fichiers de tests construisent leurs propres `Piece` et
ne dépendent que du type. Les préserver coûte zéro ligne.

`Piece` est renommé `Ecran` : une tablette n'est plus nécessairement une pièce.

### 2. L'intégration détient la vérité, l'app la lit par websocket

La configuration vit dans le config entry HA (`.storage/core.config_entries`),
donc dans les sauvegardes HA. L'application la demande par une commande
websocket dédiée. Un événement de bus déclenche le re-rendu à chaud.

*Deux approches écartées* :

- **YAML dans `config/home_desk/`** — le gain « on retrouve git » est illusoire :
  `config/` appartient à `home-manager`, pas à ce dépôt. On ne gagnerait git que
  si le propriétaire versionne son `config/`. En échange on paierait deux
  écrivains sur un même fichier et un `yaml.dump` qui écrase les commentaires à
  chaque écriture depuis un formulaire.
- **Attributs d'entités** (`sensor.home_desk_salon`) — zéro API nouvelle, mais
  fait passer de la CONFIGURATION par le bus d'ÉTAT et par le recorder. Confond
  deux natures de donnée.

Le service `home_desk.exporter` rend le filet : un YAML commenté, à la demande.

### 3. Palette fermée, agencement ouvert

Quatre réglages, et seulement eux :

1. **L'ordre des zones** — synthèse, bloc central, rangée d'ambiance, rangées de
   commandes. Le **bandeau reste fixe en haut** : c'est la barre d'état de
   l'écran, la déplacer n'a pas de sens et coûterait un cas de plus au moteur.
2. **Le contenu du bloc central par défaut** — `voiture` / `repas` / `agenda` /
   `entretien` / `previsions`. C'est `blocDefaut` promu au rang de vrai réglage.
3. **Quels modes vivent sur cet écran** — aujourd'hui DÉDUIT de la présence
   d'une donnée (`piece.minuteurs`, `piece.ouvrants`), désormais DÉCLARÉ. Les
   **modulateurs** (`invites`, `chaleur`, `delorean`) sont une liste À PART :
   `modes.ts` les tient pour une couche distincte des modes principaux — ils se
   cumulent, ne prennent le bloc de personne, et n'ont donc pas de priorité
   d'exclusivité à régler.
4. **Leur priorité relative** — l'ordre d'exclusivité des modes principaux,
   aujourd'hui écrit en dur dans `modePrincipal()`.

*Pourquoi pas une grille libre* : le bloc central n'est pas choisi par une
position dans une liste, il est disputé à l'exécution par neuf modes exclusifs ;
et le nombre de tuiles n'est pas libre non plus (`combien()` rend 0, 2 ou 4 selon
la hauteur que le bloc central mange). Une grille libre exigerait d'abandonner
ces deux mécanismes — c'est-à-dire ce que le projet vend.

### 4. Le budget devient une propriété de l'écran

`Ecran.hauteurUtile`, défaut **585** (la valeur des Fire 7). Le moteur continue
de le faire respecter ; il cesse de croire que toutes les tablettes ont le même
écran. Conséquence directe de la portabilité.

### 5. Deux contrats partagés, jamais deux copies

Le risque de cette architecture, c'est deux définitions du même schéma qui
dérivent — TypeScript côté app, `voluptuous` côté intégration.

- `contrat/ecran.schema.json` — JSON Schema versionné (`version: 1` porté dans
  la donnée, pour les migrations futures). Un test vérifie que les deux
  implémentations s'y conforment.
- `contrat/icones.json` — publié au build depuis `src/rendu/icones.ts`, pour que
  le formulaire propose les icônes RÉELLES de l'application.
- `contrat/budget.json` — les hauteurs mesurées (bloc `defaut`, bloc haut,
  rangée de tuiles, rangée d'ambiance, gouttières, les 585 px). `combien()`
  devient un calcul sur cette donnée, des deux côtés.

*Effet de bord voulu* : les mesures en pixels cessent d'être des commentaires
dans `modes.ts` pour devenir de la donnée vérifiable. C'est ce qui rend la
validation à la saisie possible (décision 7).

### 6. `note` partout

Champ libre, facultatif, sur `Ecran`, `Bouton`, `EntreeSynthese`,
`DeclarationSource` et sur chaque entrée d'agencement. Jamais rendu à l'écran.
Toujours présent dans le formulaire qui édite l'élément qu'il justifie. Repris
tel quel par l'export YAML, où il redevient un commentaire.

*Pourquoi* : `pieces.ts` porte ~300 lignes de raisonnement daté — pourquoi
« Porte » est épinglée et ce que ça coûte (le Chauffage en mode média), pourquoi
la rangée d'ambiances du salon est vide (~100 px rendus au budget), pourquoi le
rideau de cuisine passe par un script (`open_cover` ZHA s'arrête à mi-course,
mesuré le 2026-08-29). Un config entry est du JSON sans commentaires. Sans ce
champ, ce savoir est perdu.

*Pourquoi attaché à l'élément plutôt que dans `docs/`* : un document n'a aucun
lien mécanique avec le réglage. Le jour où quelqu'un désépingle « Porte » depuis
HA, rien ne lui mettrait ce document sous les yeux.

### 7. La validation passe de la compilation à la saisie

Le flow refuse à l'écriture :

- un seuil `'35'` entre guillemets quand l'opérateur est `<`/`>` (l'union
  discriminée TypeScript, rejouée en `voluptuous`) ;
- une composition qui déborde `hauteurUtile` — « cet écran déborde de 45 px en
  mode minuteur », dit AU MOMENT DE L'ÉDITION, pas devant la tablette.

Une entité inconnue du registre donne un **avertissement, jamais un refus** :
elle peut arriver plus tard.

### 8. Trois suites de tests, pas deux

`make test` garde son style — scripts autonomes, `python3` + PyYAML — parce que
sa raison d'être est de tourner sur la cible d'installation, qui n'a rien
d'autre. `make test-composant` arrive sur `pytest-homeassistant-custom-component`,
exactement comme `make test-app` est arrivé pour vitest.

La règle de `CLAUDE.md` est donc **restreinte à `make test`**, pas supprimée.

### 9. Un seul HTML, l'identité vient de l'URL

`/local/wallpanel/?ecran=salon`. Sans état, sans build par pièce, lisible dans
Fully Kiosk. `dist/` passe de trois HTML à un.

*Écarté* : l'identification par `$deviceId` Fully Kiosk (une indirection de plus
à déboguer), et le choix mémorisé dans le navigateur (un vidage de cache de la
WebView Fire 7 rouvrirait le sélecteur, et l'état vivrait sur la tablette au lieu
de vivre dans HA).

### 10. Écran d'attente franc, pas de cache local

Arbitrage du propriétaire, 2026-09-12. Une copie de la config dans la WebView de
chaque tablette serait un endroit de plus où une config périmée peut traîner, et
un suspect de plus le jour où un écran affiche quelque chose de bizarre. Une
seule vérité.

---

## Le contrat

### Forme

```
Ecran
  version: 1
  nom: string
  hauteurUtile: number = 585
  note?: string
  temperature: entity_id
  commandes: Bouton[]
  ambiances: Bouton[]
  synthese: EntreeSynthese[]
  extrasMaison: Bouton[]
  listesTachesExtra: entity_id[]
  sources: DeclarationSource[]
  ouvrants: entity_id[]
  aspirateur?: entity_id
  aspirateurMaison?: Bouton
  minuteurs?: SlotMinuteur[]
  etiquettesMinuteur?: string[]
  voiture?: Voiture
  agencement: Agencement

Agencement
  zones: ('synthese' | 'blocCentral' | 'ambiances' | 'commandes')[]
  blocDefaut?: 'voiture' | 'repas' | 'agenda' | 'entretien' | 'previsions'
  modes: ModePrincipal[]        # actifs, dans l'ordre de priorité
  modulateurs: Modulateur[]     # actifs ; cumulatifs, donc SANS ordre
  note?: string
```

`Bouton`, `EntreeSynthese`, `Voiture`, `DeclarationSource` et `SlotMinuteur`
gardent leur forme actuelle, augmentée de `note?: string`. `delorean?: true`
rejoint `modulateurs` — et NON `modes` : `modes.ts` sépare délibérément les deux
couches (« les MODULATEURS se cumulent et ne prennent le bloc de personne »),
et confondre les deux dans une seule liste ordonnée détruirait cette
distinction, qui est le cœur du dessin d'origine.

### Invariants vérifiés par le schéma

- `zones` contient chaque valeur au plus une fois ; `commandes` y est obligatoire.
- `modes` contient `defaut` obligatoirement (c'est le repli) et `alerte` en
  première position si présent (une alerte ne cède à rien).
- `blocDefaut: 'voiture'` exige `voiture` renseignée.
- `minuteur` dans `modes` exige `minuteurs` non vide.
- `modulateurs` n'a pas d'ordre significatif : le schéma le normalise en
  ensemble trié, pour qu'un diff d'export ne bruite pas.
- Le `valeur` d'une `EntreeSynthese` est un nombre si `operateur` est `<` ou `>`.
- La composition tient dans `hauteurUtile` pour CHAQUE mode actif.

---

## L'intégration

`custom_components/home_desk/` — `manifest.json` (`config_flow: true`,
`dependencies: ["http", "websocket_api"]`, `documentation` pointant vers CE
dépôt, comme la correction déjà faite sur `vignette`), `const.py`, `schema.py`,
`budget.py`, `config_flow.py`, `websocket.py`, `services.py`, `services.yaml`,
`translations/fr.json`.

### Une entrée, N sous-entrées

Une entrée de configuration « Tablettes murales ». Une **sous-entrée par écran**,
chacune une ligne dans l'UI avec son propre bouton « Configurer ». Ajouter une
tablette, c'est « Ajouter un écran » — la même opération pour la quatrième que
pour les trois existantes.

### Le menu d'un écran

```
Écran « Salon »
├─ Identité et budget      nom · hauteur utile · note
├─ Tuiles de commande      liste : ajouter · modifier · supprimer · monter · descendre
├─ Rangée d'ambiance       même liste
├─ Ligne de synthèse       entité · opérateur · seuil · texte · perso · horsTaches · note
├─ Sources média           nom + 6 jeux d'entités, en sections repliables
├─ Blocs et modes          ordre des zones · bloc central par défaut · modes actifs et priorité
├─ Minuteurs               slots + étiquettes proposées
└─ Voiture                 7 entités, ou « pas de voiture »
```

**Monter/descendre plutôt qu'un glisser-déposer** : HA n'offre pas de
réordonnancement fiable dans un formulaire de flow. Ennuyeux, sûr.

Sélecteurs natifs `EntitySelector` filtrés par domaine (`light`, `cover`,
`lock`, `todo`, `media_player`…). Les icônes viennent de `contrat/icones.json`
via un `SelectSelector`.

### Transport

- Commande websocket `home_desk/ecran` (paramètre : le nom) → la config
  **résolue et validée**.
- Commande websocket `home_desk/ecrans` → la liste des écrans configurés, pour
  le sélecteur de la dégradation n°1.
- Événement de bus `home_desk_config_changed` (charge utile : le nom de l'écran)
  à chaque écriture d'une sous-entrée.

### Services

- `home_desk.exporter` — écrit un YAML commenté (les `note` redeviennent des
  commentaires) dans `config/`.
- `home_desk.importer` — relit ce YAML. C'est aussi l'entrée de la migration.

---

## L'application

### Le démarrage change de nature

Aujourd'hui `PIECES[nomPiece]` est synchrone : la config est dans le bundle,
disponible avant la première ligne de réseau. Désormais elle arrive APRÈS
l'ouverture du websocket.

`demarrer(racine, piece)` devient `demarrer(racine, nomEcran)`. Entre les deux,
un écran d'attente franc (décision 10).

### `rendreCorps` devient un assembleur

Sa composition est aujourd'hui écrite dans son template `lit`. Elle devient un
parcours de `agencement.zones` avec une table `nom de zone → fonction de rendu`.
Les fonctions existantes (`ligneSynthese`, la rangée d'ambiances, les rangées de
commandes, la carte média, les blocs centraux) NE CHANGENT PAS : elles
deviennent les entrées de cette table.

### `modePrincipal()` garde ses conditions, perd sa hiérarchie

La liste ordonnée des modes actifs vient de la config. Les conditions de chaque
mode restent en TypeScript : elles lisent `ContexteModes`, et les rendre
configurables serait écrire un langage de règles.

### `combien()` lit la donnée

`contrat/budget.json` et `ecran.hauteurUtile` remplacent les constantes. Même
calcul, mêmes résultats pour les trois écrans actuels — test de non-régression
explicite.

### `absenceNommee` ne bouge pas

Les cinq points de passage documentés dans `CLAUDE.md` restent tels quels
(`rendu/corps.ts` l. 105, 188, 356, 357 et `rendu/maison.ts` l. 88). Le champ
vient de la config au lieu du littéral. Le test qui garde les cinq reste.

### Quatre dégradations nommées

Aucune ne laisse `#app` vide — la règle posée par la ronde de correction 1.

| Cas | Ce que l'écran montre |
|---|---|
| `?ecran=` absent ou inconnu | La liste des écrans configurés, tapable. Pas un mur blanc, pas un « salon » deviné. |
| HA joignable, aucun écran configuré | « Aucun écran configuré » et où aller le faire. |
| HA injoignable au démarrage | L'écran d'attente, puis le bandeau hors ligne existant. |
| Config d'une `version` inconnue | Refus net et message. Jamais un rendu à moitié. |

---

## La migration

**Dans cet ordre, et pas l'inverse.**

1. `app/outils/exporter-ecrans.mjs` lit `PIECES` et produit le YAML que
   `home_desk.importer` avale. Il passe par l'AST TypeScript pour récupérer les
   **commentaires qui précèdent chaque littéral** et les poser en `note:` — la
   majorité des ~300 lignes, attachées à ce qu'elles justifient.
2. Passe manuelle pour les commentaires portés par les TYPES plutôt que par la
   donnée. Assumée.
3. Import dans HA.
4. Vérification que les trois écrans rendent à l'identique
   (`outils/mesurer-rendus.mjs` existe déjà pour ça).
5. **Et seulement alors**, retrait des littéraux de `pieces.ts`.
6. **Retrait de l'outil lui-même.** `exporter-ecrans.mjs` lit `PIECES` : privé
   de sa donnée, il ne compile plus. C'est un outil JETABLE, à supprimer dans le
   même commit que les littéraux — le garder laisserait dans le dépôt un fichier
   mort qui a l'air vivant, exactement le piège que `CLAUDE.md` nomme pour la
   génération 1.

---

## Les tests

- **32 fichiers vitest sur 41 ne bougent pas.**
- Les **9 qui lisent `PIECES`** cessent d'affirmer des choses sur cette maison
  (« le salon épingle Porte ») pour affirmer des choses sur le contrat :
  `pieces.test.ts` devient `contrat.test.ts` ; les autres travaillent sur un
  triplet d'écrans de référence construit dans `tests/aides.ts`, à côté du
  `pieceVide` qui y est déjà.
- **Nouveaux** : conformité du schéma des deux côtés, égalité des deux calculs
  de budget, transport bouchonné, les quatre dégradations.
- **`make test-composant`** (pytest) : les flows, y compris leurs cas d'erreur,
  le schéma `voluptuous`, l'export/import YAML.
- **`make test`** inchangé dans son style et sa raison d'être.

---

## Le build et l'installation

- `gabarits/piece.html` rend un seul `index.html`. `dist/` passe de trois HTML
  à un, et **reste versionné** — décision 2 de la spec du 2026-08-29, intacte.
  Les trois `<piece>.html` actuels ne sont donc plus produits ; ceux qui SONT
  déjà en production survivent à la bascule et ne partent qu'à la dernière
  étape de la mise en production, cf. plus bas.
- Le build publie `contrat/icones.json` et `contrat/budget.json`.
- Le hook dépose un troisième arbre, `custom_components/home_desk/`, exactement
  comme `vignette`. Il ne touche toujours aucun répertoire partagé, et il
  n'écrit toujours pas dans `configuration.yaml`.
- **Pas de hook `activate`** — décision intacte.

### Les gestes opérateur

Le geste n°3 change de contenu : la `startUrl` devient
`/local/wallpanel/?ecran=<nom>`.

Un **quatrième geste** apparaît : ajouter l'intégration « Tablettes murales » et
créer ses écrans.

---

## Ce que ça coûte — les régressions nommées

À écrire franchement dans le README, pas à laisser en silence.

1. **Une installation neuve n'affiche plus rien** tant qu'on n'a pas configuré
   au moins un écran. C'est le prix direct de la portabilité, et il se paie à
   chaque nouvelle maison.
2. **La config n'est plus versionnée par défaut.** Elle vit dans `.storage`,
   donc dans les sauvegardes HA. `home_desk.exporter` le rattrape à la demande,
   pas automatiquement.
3. **Le raisonnement quitte le dépôt.** Les `note` sont sauvegardées avec HA, pas
   avec git. Un `git log` ne racontera plus pourquoi « Porte » est épinglée.
4. **Un aller-retour réseau s'ajoute au démarrage.** L'écran d'attente est
   franc, mais il existe, là où le bundle affichait immédiatement.
5. **Une dépendance de test lourde entre** (`pytest-homeassistant-custom-component`),
   qui épingle une version de HA et qu'il faudra suivre.

---

## La mise en production

Le chantier ne s'arrête pas au dépôt : il se termine **installé sur l'instance
Home Assistant de cette maison** (demande du propriétaire, 2026-09-12). Trois
tablettes en service quotidien sont concernées, donc chaque geste doit avoir son
retour arrière avant d'être fait.

### Ce qui est mesuré et disponible (2026-09-12)

| Fait | Valeur |
|---|---|
| Répertoire de configuration | `/opt/nivuus/home-manager/config` |
| Bundle actuellement servi | `config/www/wallpanel/` — `salon.html`, `bureau.html`, `cuisine.html`, `wallpanel.js`, `wallpanel.css`, `assets/` |
| Conteneur | `homeassistant`, HA **2026.9.1** |
| Validation de configuration | `docker exec homeassistant python -m homeassistant --script check_config -c /config` |
| Repointage des tablettes | services `fully_kiosk.set_config` (clé `startURL`) et `fully_kiosk.load_url` |

**Les tablettes se repointent depuis HA.** C'est le fait décisif : le geste
opérateur n°3 (« vérifier la `startUrl` des trois tablettes dans Fully Kiosk »)
n'exige plus de manipuler les tablettes, et le retour arrière est le même appel
de service avec l'ancienne URL. Aucune intervention physique sur le mur.

### L'ordre, et son retour arrière à chaque étape

| # | Geste | Retour arrière |
|---|---|---|
| 1 | Sauvegarde HA complète, et copie datée de `config/www/wallpanel/` | — |
| 2 | Déposer `custom_components/home_desk/`, `check_config`, redémarrer HA | Retirer le répertoire, redémarrer |
| 3 | Ajouter l'intégration, **importer** le YAML produit par `exporter-ecrans.mjs` | Supprimer l'entrée de configuration |
| 4 | Déposer le nouveau bundle **à côté** de l'ancien : `index.html` arrive, les trois `<piece>.html` RESTENT en place | Les trois tablettes n'ont pas bougé — elles servent encore l'ancien chemin |
| 5 | Repointer **UNE** tablette (`fully_kiosk.set_config`, la cuisine — l'écran le plus riche, minuteurs et recette compris) | `set_config` avec l'ancienne URL |
| 6 | Vérifier, à l'œil et avec `outils/mesurer-rendus.mjs`, que le rendu est identique à l'avant | ↑ |
| 7 | Repointer les deux autres | ↑ |
| 8 | Retirer les trois `<piece>.html` obsolètes de `www/wallpanel/` | Les redéposer depuis la copie datée de l'étape 1 |

**Étapes 4 et 5 : l'ancien et le nouveau coexistent.** C'est ce qui permet de
valider sur une seule tablette avant d'engager les trois, et de revenir en
arrière sans redéployer quoi que ce soit. Les trois `<piece>.html` ne sont PAS
supprimés par le build du dépôt : ils disparaissent à l'étape 8, une fois que
plus personne ne les demande.

**Le retrait du répertoire partagé.** L'étape 8 touche `config/www/wallpanel/`,
que le hook d'installation remplace en entier au prochain déploiement du
package. Rien à faire de spécial : les trois fichiers ne seront simplement plus
dans `dist/`, donc plus dans l'arbre déposé.

---

## Ce qui reste ouvert

- Le nombre d'écrans de référence dans `tests/aides.ts` (trois, comme
  aujourd'hui ? un seul, riche ?) — à trancher en écrivant le plan.
- Le format exact de `contrat/budget.json` : liste de hauteurs nommées, ou
  formule. À trancher en mesurant ce dont `combien()` a réellement besoin.
- Faut-il une commande websocket pour ÉCRIRE la config depuis la tablette (une
  vue « Réglages » sur l'écran) ? Hors périmètre ici, mais l'architecture ne
  l'interdit pas — c'est un service de plus sur le même composant.
