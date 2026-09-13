# Paramétrer les écrans muraux depuis Home Assistant

*Spec de conception — 2026-09-12, amendée le 2026-09-13*

> **Amendements du 2026-09-13.** Les plans 1, 2 et 3a sont fusionnés. Les
> sections que ce chantier a déjà livrées sont marquées **FAIT** ; les
> affirmations que la mesure a démenties sont corrigées à leur place, avec le
> chiffre mesuré. Six arbitrages du propriétaire sont intégrés : l'objectif 1
> re-scopé, le transport des refus par leur `code`, les quatre champs racine
> rendus éditables, l'avertissement d'entité inconnue livré en 3b, la branche
> de transition qui rachète le retour arrière de la mise en production, et la
> dette des ordres de zones mesurée plutôt que réparée.

## Le besoin

> « Plutôt que de faire du code dédié pour chaque tablette, il faudrait pouvoir
> paramétrer l'affichage de chaque tablette depuis HA. »

Deux objectifs, retenus tous les deux (arbitrage du propriétaire, 2026-09-12) :

1. **Portabilité — la CONFIGURATION D'ÉCRAN quitte le dépôt.** *Amendé le
   2026-09-13, après mesure refaite.*

   | Mesure sur `app/src/` (2026-09-13) | Distincts |
   |---|---|
   | `entity_id` distincts, tous fichiers confondus | **69** |
   | …dans `app/src/ecran.ts` | **54** (113 occurrences) |
   | …apparaissant dans un AUTRE fichier | 30 |
   | …dont **aussi** présents dans `ecran.ts`, donc emportés avec les littéraux | **15** |
   | **Reliquat réel après le plan 3c** | **15** — 14 propres à cette maison, plus `sun.sun`, universel |

   Le dépôt passe donc de **69 à 15** `entity_id` distincts, et non à zéro. Les
   quinze survivants vivent dans sept fichiers : `rendu/maison.ts` (la table
   `TOUTE_LA_MAISON`), `demarrage.ts` (les quatre `calendar.*`, `weather.maison`,
   `input_boolean.mode_invites`, `input_number.duree_minuteur_cuisine`,
   `sun.sun`), `alertes.ts` (les trois `binary_sensor.tablette_*_mouvement`, les
   trois capteurs de présence, le distributeur de croquettes), puis
   `garde-manger.ts`, `rendu/defaut.ts`, `rendu/bandeau.ts`, `rendu/nuit.ts`.

   L'objectif porte donc sur **la configuration d'écran, pas sur l'inventaire de
   la maison** : les listes communes et les capteurs d'ambiance restent, et le
   README garde son encadré, reformulé. La formulation antérieure — « plus aucun
   `entity_id` de cette maison dans le dépôt » — annonçait un résultat que ce
   chantier n'atteint pas. **L'affirmation jumelle de `CLAUDE.md`** (« `app/src/
   ecran.ts` est la seule couture vers cette maison ») **est fausse par la même
   mesure** : à corriger là-bas, et à garder par un test — `app/` n'est scanné
   par aucune garde de portabilité aujourd'hui, `tests/test_dist_portable.py` ne
   connaissant que `dist/` et `custom_components/`.

   *Pourquoi ne pas prendre les quinze aussi* : ce serait trois champs de contrat
   neufs (`alertes`, `toutLaMaison`, `calendriers`) plus quatre littéraux
   isolés — un quatrième plan, pour une portabilité vers une AUTRE maison que
   rien n'indique être demandée. Le besoin énoncé est de paramétrer CES
   tablettes.
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
| Consommateurs de la donnée `ECRANS` dans `src/` | **1** (`src/index.ts:8`) | La couture annoncée par le README existe réellement. Tout le reste de l'app reçoit déjà `piece: Ecran` en paramètre. |
| Fichiers de tests qui lisent la donnée `ECRANS` | **12 sur 47**, **292 références** (mesuré le 2026-09-13 ; la spec disait 9 sur 41) : `corps` 76, `ecran` 52, `demarrage` 48, `contrat-schema` 28, `orchestration` 27, `maison` 16, `modes` 15, `nuit` 13, `budget` 9, `agencement` 8, `cochage` 5, `navigation` 5 | Les **35 autres** construisent leurs propres `Ecran` littéraux et survivent INTACTS si le TYPE survit : l'argument de la décision 1 TIENT TOUJOURS. Mais le coût du retrait (plan 3c) est ~33 % plus élevé que budgété. |
| Version de Home Assistant sur cette maison | **2026.9.1** | `ConfigSubentryFlow` est disponible (vérifié par import). Décide la forme : une entrée, N sous-entrées. |
| Taille de `app/src/ecran.ts` (ex-`pieces.ts`) | **551 lignes, 286 de commentaire, 3 `note:` déjà posées, 54 `entity_id` distincts en 113 occurrences** (mesuré le 2026-09-13 ; la spec disait 515 et ~300) | Motive le champ `note` (décision 6) et la reprise automatique des commentaires par l'outil de migration. C'est le devis exact de l'outil du plan 3c. |
| Palette de modes principaux | 9, exclusifs (`modes.ts`) | Le bloc central est DISPUTÉ à l'exécution, pas placé dans une liste. Décide la forme de l'agencement (décision 3). |
| Budget de hauteur | 585 px, `combien()` rend 0, 2 ou 4 tuiles | Motive `contrat/budget.json` et la validation à la saisie (décision 5). |
| Raison du style « python3 + PyYAML seulement » | `Makefile`, l. 5-8 : *« lancer sur une machine qui n'a rien d'autre, y compris la cible d'installation »* | La règle est restreinte, pas supprimée (décision 8). |

---

## Les décisions

### 1. Le type reste dans le dépôt, la donnée part

`app/src/ecran.ts` (ex-`pieces.ts`) se scinde. Les **types** (`Ecran`, `Bouton`,
`EntreeSynthese`, `Voiture`, `DeclarationSource`, et le nouveau `Agencement`)
restent versionnés : ils SONT le contrat. Les trois objets littéraux
disparaissent.

*Pourquoi* : **35 des 47** fichiers de tests construisent leurs propres `Ecran`
et ne dépendent que du type (mesuré le 2026-09-13 ; la spec disait 32 sur 41).
Les préserver coûte zéro ligne.

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

**FAIT (plans 1 à 3a), et augmenté.** `contrat/` livre **cinq** fichiers JSON et
son README, pas trois : les trois ci-dessus, plus `contrat/cas-budget.json` et
`contrat/cas-schema.json` — les **corpus de cas partagés**, lus chacun par DEUX
suites (`app/tests/cas-*.test.ts` en TypeScript/ajv,
`tests/composant/test_budget.py` et `test_schema.py` en Python/voluptuous). Ce
sont eux qui rendent « deux implémentations, une seule vérité » vérifiable au
lieu d'espéré : un cas présent d'un côté et absent de l'autre est impossible,
c'est le même fichier. `custom_components/home_desk/contrat/` en porte une copie
embarquée, régénérée par `make contrat`, et `make test` refuse de passer si les
deux divergent.

### 6. `note` partout

Champ libre, facultatif, sur `Ecran`, `Bouton`, `EntreeSynthese`,
`DeclarationSource` et sur chaque entrée d'agencement. Jamais rendu à l'écran.
Toujours présent dans le formulaire qui édite l'élément qu'il justifie. Repris
tel quel par l'export YAML, où il redevient un commentaire.

*Pourquoi* : `ecran.ts` porte **286 lignes** de raisonnement daté — pourquoi
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
- une composition qui déborde `hauteurUtile` — « cet écran déborde de N px en
  mode minuteur », dit AU MOMENT DE L'ÉDITION, pas devant la tablette. *Le
  « 45 px » que la spec citait est faux : les valeurs mesurées de
  `verifier_budget` sont 336 px restants en mode `defaut` sur 100 px de bloc,
  58 en mode `minuteur` sur 500, et 0 à 585 — la valeur de débordement dépend de
  la composition, aucune constante ne la fixe.*

Une entité inconnue du registre donne un **avertissement, jamais un refus** :
elle peut arriver plus tard.

**NON TENU au 2026-09-13, et repris par le plan 3b** (arbitrage du propriétaire).
Mesuré en relecture finale du plan 3a : `light.nexiste_absolument_pas` est
accepté avec `errors={}` **et** `description_placeholders={}` — du silence, pas
un avertissement. Le plan 3b livre la lecture du registre d'entités HA et
l'avertissement. Une décision de spec non tenue et non rayée est la prose qui
ment, et ce chantier l'a payée treize fois.

### 8. Trois suites de tests, pas deux

`make test` garde son style — scripts autonomes, `python3` + PyYAML — parce que
sa raison d'être est de tourner sur la cible d'installation, qui n'a rien
d'autre. `make test-composant` arrive sur `pytest-homeassistant-custom-component`,
exactement comme `make test-app` est arrivé pour vitest.

La règle de `CLAUDE.md` est donc **restreinte à `make test`**, pas supprimée.

### 9. Un seul HTML, l'identité vient de l'URL

`/local/wallpanel/index.html?ecran=salon`. Sans état, sans build par pièce,
lisible dans Fully Kiosk. `dist/` passe de trois HTML à un.

**Le nom du fichier est explicite, et ce n'est pas une coquetterie.** *Corrigé le
2026-09-13* : la spec écrivait `/local/wallpanel/?ecran=salon`, qui rendrait
**403**. Mesuré dans les sources installées — `homeassistant.components.http.static.
CachingStaticResource` sous-classe `aiohttp.web_urldispatcher.StaticResource` sans
toucher au traitement des répertoires, et
`StaticResource._resolve_path_to_response` lève `HTTPForbidden` sur un répertoire
dès lors que `show_index` est faux, ce qu'il est par défaut. **aiohttp ne sert
jamais `index.html` implicitement.**

*Écarté* : l'identification par `$deviceId` Fully Kiosk (une indirection de plus
à déboguer), et le choix mémorisé dans le navigateur (un vidage de cache de la
WebView Fire 7 rouvrirait le sélecteur, et l'état vivrait sur la tablette au lieu
de vivre dans HA).

### 10. Écran d'attente franc, pas de cache local

Arbitrage du propriétaire, 2026-09-12. Une copie de la config dans la WebView de
chaque tablette serait un endroit de plus où une config périmée peut traîner, et
un suspect de plus le jour où un écran affiche quelque chose de bizarre. Une
seule vérité.

### 11. Un refus de Home Assistant se transporte par son CODE, pas par son texte

*Décision du 2026-09-13 (arbitrage du propriétaire). C'est le préalable du plan
3b : elle conditionne le transport, les écrans de repli et leurs tests.*

`app/src/connexion.ts:149-150` jette aujourd'hui `error.code` et ne garde que le
`message` :

```ts
if (m.success) p.resolve(m.result);
else p.reject(new Error(m.error?.message ?? 'commande refusée'));
```

En face, `websocket.py` a investi dans le code : `ecran_introuvable`,
`version_inconnue`, `ecran_corrompu`, plus `invalid_format` de Home Assistant.
Leurs `message` sont du **français Python sans accents**, jamais passés par
`translations/` : ce sont des diagnostics de développeur destinés au journal HA,
pas des phrases d'utilisateur.

`envoyerCommande` cesse donc de jeter le code : elle rejette une erreur qui le
porte, et `app/src/` traduit chaque code en une phrase française accentuée, à
côté de `sessionAbsente()` et `erreurDemarrage()` qui existent déjà.

*Pourquoi pas l'inverse — accentuer les messages du composant et les afficher
tels quels* : une des cinq pannes n'est pas produite par ce dépôt. Quand
l'intégration n'est pas installée du tout, la commande n'est pas enregistrée et
c'est le cœur de HA qui répond — `websocket_api/const.py:42`,
`ERR_UNKNOWN_COMMAND = "unknown_command"`, message **« Unknown command. »**, en
anglais. Aucune traduction de ce dépôt ne l'atteint. L'option « les messages
deviennent des chaînes utilisateur » est donc structurellement incomplète, et
elle rendrait décoratif le travail qui a produit ces codes.

*Écarté aussi* : `send_error(translation_key=…)`, que HA offre depuis
`websocket_api/messages.py`. Elle sert le **frontend** HA, qui sait résoudre un
domaine de traduction. Notre application devrait appeler
`frontend/get_translations` et embarquer un résolveur, pour rendre des phrases
qu'elle sait déjà écrire elle-même.

**Trois autres capacités manquent au même module, et le plan 3b les livre dans
la même tâche** — ce ne sont pas des arbitrages, ce sont des trous :

1. **`connecter()` rend la main AVANT l'authentification** (`connexion.ts:121-155`)
   : elle crée le WebSocket, pose les gestionnaires et retourne, sans connaître
   `auth_ok`. Envoyer une commande juste après `await cx.connecter()` appelle
   `ws.send()` sur une socket en `CONNECTING`. **La toute première commande
   websocket de l'application ne peut pas être envoyée de façon sûre
   aujourd'hui** — aucun appel existant ne s'en apercevait, `envoyerCommande`
   n'étant appelée que sous la garde `estHorsLigne`, donc bien après `auth_ok`.
2. **Aucun abonnement d'événement générique** : `connexion.ts:138` envoie
   `subscribe_events` avec `event_type: 'state_changed'` en dur, et le
   répartiteur ne traite `m.type === 'event'` que si `m.event?.data?.new_state`
   existe. Un `home_desk_config_changed` tombe dans le vide, sans erreur — **la
   décision 2 (« un événement de bus déclenche le re-rendu à chaud ») est
   aujourd'hui inatteignable EN SILENCE**.
3. **`envoyerCommande` n'a aucun délai maximal** : si HA accepte la commande puis
   redémarre, la promesse reste en suspens pour toujours, et l'écran d'attente
   « franc » de la décision 10 devient un écran d'attente **permanent**.

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

**Quatre champs racine sans porte de saisie, et ce qu'on en fait.** Mesuré au
2026-09-13 : `aspirateur`, `aspirateurMaison`, `listesTachesExtra` et `delorean`
n'existent que dans `schema.py`, en `vol.Optional`. Ils **entrent** par
`home_desk.importer`, **survivent** à toute édition passant par le formulaire et
**ressortent** par `home_desk.exporter` — mais aucune section ne permet de les
créer ni de les modifier depuis Home Assistant. Arbitrage du propriétaire,
2026-09-13 : **on les rend éditables**, parce que le besoin énoncé est de
« paramétrer l'affichage de chaque tablette depuis HA » et que quatre champs qui
exigent d'éditer un YAML sont une réponse partielle à cette phrase.

- `aspirateur` (une entité) et `delorean` (`const: true`, une case à cocher)
  rejoignent la section **Identité**, qui existe déjà : coût quasi nul.
- `listesTachesExtra` (tableau d'entités) prend le squelette de la section
  `ouvrants`. **Préalable obligatoire dans la même tâche** : `config_flow.py` est
  à **500 lignes sur 500**, marge zéro, et une section « liste » de plus coûte
  exactement 10 lignes de relais → 501. Les **seize relais écrits à la main**,
  que HA ne consulte que par `getattr`, sont donc généralisés par un
  `__getattr__` de classe — couture nommée trois fois par le plan 3a, et qui
  débloque toute section future.
- `aspirateurMaison` (un `Bouton` complet) part au plan **3c**, parce que son
  vrai blocage n'est pas l'absence de formulaire : `app/src/rendu/maison.ts:79`
  fait sa substitution en comparant à `'vacuum.aspirateur_cuisine'` **écrit en
  dur dans le rendu**. Le rendre éditable avant de traiter ce littéral livrerait
  un formulaire qui écrit une valeur que le rendu n'honore que pour une entité de
  cette maison — un bouton à demi mort.

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

Aujourd'hui `ECRANS[nomPiece]` est synchrone : la config est dans le bundle,
disponible avant la première ligne de réseau. Désormais elle arrive APRÈS
l'ouverture du websocket.

`demarrer(racine, piece)` devient `demarrer(racine, nomEcran)`. Entre les deux,
un écran d'attente franc (décision 10).

### `rendreCorps` devient un assembleur — **FAIT (plan 2)**

`app/src/rendu/corps.ts:568-591` : la table `ZONES`, parcourue selon
`agencement.zones`. Sa composition est aujourd'hui écrite dans son template `lit`. Elle devient un
parcours de `agencement.zones` avec une table `nom de zone → fonction de rendu`.
Les fonctions existantes (`ligneSynthese`, la rangée d'ambiances, les rangées de
commandes, la carte média, les blocs centraux) NE CHANGENT PAS : elles
deviennent les entrées de cette table.

### `modePrincipal()` garde ses conditions, perd sa hiérarchie — **FAIT (plan 2)**

La liste ordonnée des modes actifs vient de la config. Les conditions de chaque
mode restent en TypeScript : elles lisent `ContexteModes`, et les rendre
configurables serait écrire un langage de règles.

### `combien()` lit la donnée — **FAIT (plan 2)**

`contrat/budget.json` et `ecran.hauteurUtile` remplacent les constantes
(`app/src/modes.ts:17`, `import BUDGET from '../../contrat/budget.json'`). Même
calcul, mêmes résultats pour les trois écrans actuels — test de non-régression
explicite.

### `absenceNommee` ne bouge pas

Les cinq points de passage restent tels quels. **Leurs numéros de ligne vivent
dans `CLAUDE.md`, et NULLE PART AILLEURS** : ceux que cette spec citait (105,
188, 356, 357 et `maison.ts` 88) sont périmés — les vrais sont `rendu/corps.ts`
106, 270, 417, 425 et `rendu/maison.ts` 90. Deux documents qui portent le même
numéro divergeront ; celui-ci renvoie donc à l'autre au lieu de le recopier. Le
champ vient de la config au lieu du littéral. Le test qui garde les cinq reste.

### Cinq dégradations nommées

*Quatre dans la spec d'origine ; la cinquième ajoutée le 2026-09-13.* Aucune ne
laisse `#app` vide — la règle posée par la ronde de correction 1.

| Cas | Code sur le fil | Ce que l'écran montre |
|---|---|---|
| `?ecran=` absent ou inconnu | `ecran_introuvable` | La liste des écrans configurés, tapable. Pas un mur blanc, pas un « salon » deviné. |
| HA joignable, aucun écran configuré | — (liste vide) | « Aucun écran configuré » et où aller le faire. |
| HA injoignable au démarrage | — (réseau) | L'écran d'attente, puis le bandeau hors ligne existant. |
| Config d'une `version` inconnue | `version_inconnue` / `ecran_corrompu` | Refus net et message. Jamais un rendu à moitié. |
| **L'intégration n'est pas installée** | `unknown_command` (HA) | « L'intégration Tablettes murales n'est pas installée sur ce Home Assistant », et le geste. |

**Pourquoi la cinquième.** Mesuré : quand la commande n'est pas enregistrée, HA
répond `unknown_command` / « Unknown command. », instantanément et correctement.
Sans elle, l'application retombe sur `erreurDemarrage()` — *« L'écran n'arrive
pas à joindre la maison. Ça peut venir du réseau ou de la session. »* — qui est
un **mensonge** : il envoie l'opérateur déboguer son réseau au lieu d'installer
l'intégration. C'est le « bouton mort en prose » sous sa forme la plus coûteuse,
et c'est exactement le cas de la **régression n°1** ci-dessous, que cette spec
nommait dans ses régressions sans l'afficher nulle part.

**La forme du filet, pour ces cinq.** Le plan 3a a payé douze fois la même
leçon — « des règles justes, prouvées une fois par une sonde jetable, gardées
zéro fois ». Donc, et le plan doit l'écrire :

- **un test par dégradation qui épingle LA PHRASE RENDUE**, pas le code : un test
  qui épingle la moitié d'un message laisse l'autre moitié mentir ;
- **un test qui épingle la VALEUR LITTÉRALE de chaque code sur le fil** —
  `app/src/` est en TypeScript et ne peut pas importer `const.py` ; un test qui
  compare à la constante est tautologique. Les valeurs s'écrivent en dur des deux
  côtés, et c'est le seul filet à la frontière de langage ;
- **un décor à DEUX écrans** partout où la règle parle de « celui-ci et pas les
  autres » : un décor trop pauvre a déjà rendu deux tests aveugles sur ce
  chantier.

---

## La migration

**Dans cet ordre, et pas l'inverse.**

1. `app/outils/exporter-ecrans.mjs` lit `ECRANS` et produit le YAML que
   `home_desk.importer` avale. Il passe par l'AST TypeScript pour récupérer les
   **commentaires qui précèdent chaque littéral** et les poser en `note:` — la
   majorité des ~300 lignes, attachées à ce qu'elles justifient.
2. Passe manuelle pour les commentaires portés par les TYPES plutôt que par la
   donnée. Assumée.
3. Import dans HA.
4. Vérification que les trois écrans rendent à l'identique avec
   **`app/outils/verifier-rendu.mjs`** (4 621 lignes, mode `--deploye`). *La
   spec citait `outils/mesurer-rendus.mjs` : mauvais outil — ces 94 lignes
   mesurent le COÛT (messages websocket, temps de script, tas JS), pas le
   rendu.*
5. **Et seulement alors**, retrait des littéraux d'`ecran.ts` — et pas avant
   d'avoir vécu avec en production, cf. l'ordre de la mise en production
   ci-dessous : ce retrait EST la charge utile de l'étape 8.
6. **Retrait de l'outil lui-même ET de ses épreuves.** `exporter-ecrans.mjs` lit
   `ECRANS` : privé de sa donnée, il ne compile plus. C'est un outil JETABLE, à
   supprimer dans le même commit que les littéraux — le garder laisserait dans le
   dépôt un fichier mort qui a l'air vivant, exactement le piège que `CLAUDE.md`
   nomme pour la génération 1. Les trois épreuves ci-dessous importent `ECRANS`
   elles aussi : elles sont jetables **par construction** et partent dans le même
   commit.

### La forme de l'outil, et comment on prouve qu'il n'a rien perdu

**L'AST ne sert qu'à la moitié « commentaires ».** Pour la DONNÉE, l'outil
compile `src/ecran.ts` en mémoire avec `esbuild`, importe `ECRANS` et sérialise :
c'est exact par construction, puisqu'il ÉVALUE le module au lieu de le relire. Un
AST qui reconstruit des valeurs littérales est un second interpréteur de
TypeScript, et c'est précisément là qu'un cas limite disparaît. La voie a déjà
été démontrée : la relecture finale du plan 3a a extrait les trois écrans ainsi,
13 877 octets de JSON.

**Le rendu YAML passe par `yaml_ecrans.rendre()`**, le module Python déjà gardé
par 23 tests — jamais par un rendeur maison, qui divergerait.

**Le fichier produit n'entre JAMAIS dans git** : il porte les 54 `entity_id`. Il
va dans un chemin de travail, puis dans `config/home_desk_ecrans.yaml` sur
l'hôte, nom fixé par `const.FICHIER_EXPORT_ECRANS` — le service n'accepte aucun
chemin d'appel.

**La preuve tient en trois niveaux, parce que les deux moitiés n'ont pas la même
nature de preuve.** L'aller-retour du plan 3a ne vaut rien ici : il comparait du
YAML à du YAML, alors que cette épreuve compare du **TypeScript** à du YAML.

1. **La donnée — une égalité, décidable et totale.** Pour chacun des trois
   écrans : ce que rend le vrai transport `home_desk/ecran` **égale**
   `ECRANS[nom]` augmenté de `{version: 1}`, champ par champ. Plus deux
   dénombrements, qu'une égalité profonde manquerait si un champ optionnel
   disparaissait des deux côtés : **54 `entity_id` distincts, 113 occurrences**,
   et le décompte par domaine (9 `binary_sensor`, 7 `sensor`, 7 `media_player`,
   7 `light`, 4 `todo`, 4 `script`, 3 `timer`, 3 `input_text`, 2 `vacuum`,
   2 `fan`, 2 `cover`, 2 `button`, 1 `lock`, 1 `climate`).
2. **Les commentaires — un REGISTRE, pas une égalité.** 286 lignes de
   commentaire ne se comparent à rien. L'outil n'émet donc pas seulement un
   YAML : il émet un **registre exhaustif**, une ligne par plage de commentaire
   du fichier, avec **un verdict et un seul** parmi trois — `attachée` (devenue
   la `note` de tel chemin, p. ex. `cuisine.commandes[3].note`), `porte sur un
   TYPE` (reste dans le dépôt : les docstrings de `Bouton`, `Voiture`,
   `EntreeSynthese` ne partent pas, c'est la décision 1), ou `orpheline,
   abandonnée` avec sa raison, écrite par un humain. **L'outil ÉCHOUE si une
   seule plage n'a pas de verdict** : la somme des trois égale le nombre total de
   plages. C'est ce qui transforme « passe manuelle assumée » (étape 2) en une
   liste auditable et finie. C'est le seul endroit de ce chantier où une perte
   serait **silencieuse** : une donnée perdue casse un test, un raisonnement
   perdu ne casse rien et ne se remarque que le jour où personne ne sait plus
   pourquoi « Porte » est épinglée.
   *Réserve mesurée* : `yaml_ecrans` **aplatit une note multiligne** (limitation
   documentée au plan 3a). Les trois `note:` réelles d'`ecran.ts` sont
   monolignes, mais les 286 lignes de commentaire sont massivement multilignes.
   Le registre porte donc une quatrième colonne — **le nombre de lignes de la
   note produite** — et l'outil ne perd rien en silence : il joint les lignes
   avec un séparateur explicite, documenté, avec un cas dans le corpus partagé.
3. **Le rendu — l'épreuve qui compte.** Ni la donnée ni les notes ne disent ce
   que la tablette AFFICHE. Un test temporaire monte chaque écran **deux fois** —
   une fois depuis `ECRANS`, une fois depuis le transport — et compare **le DOM
   rendu**, sur les modes que les trois écrans atteignent réellement. La couture
   existe : `monterDemarrage(piece, options)` (`app/tests/aides.ts:161`).

---

## Les tests

- **35 fichiers vitest sur 47 ne bougent pas** (la spec disait 32 sur 41).
- Les **12 qui lisent `ECRANS`**, soit **292 références**, cessent d'affirmer des
  choses sur cette maison (« le salon épingle Porte ») pour affirmer des choses
  sur le contrat ; ils travaillent sur un triplet d'écrans de référence construit
  dans `tests/aides.ts`, à côté de l'`ecranVide` qui y est déjà.
  *`contrat-schema.test.ts` et `contrat-icones.test.ts` **existent déjà** et
  lisent `ECRANS` (28 références) : ce sont des reprises, pas des créations.*
- **Nouveaux** : conformité du schéma des deux côtés, égalité des deux calculs
  de budget, transport bouchonné, les **cinq** dégradations.
- **`make test-composant`** (pytest) : les flows, y compris leurs cas d'erreur,
  le schéma `voluptuous`, l'export/import YAML.
- **`make test`** inchangé dans son style et sa raison d'être.

---

## Le build et l'installation

- `gabarits/piece.html` rend un `index.html`. `dist/` **reste versionné** —
  décision 2 de la spec du 2026-08-29, intacte. *Précisé le 2026-09-13* : les
  trois `<piece>.html` continuent d'être produits par `generer-pages.mjs`
  **pendant toute la migration**, aux côtés d'`index.html` — `dist/` porte donc
  quatre HTML, et ne passe à un qu'à l'étape 8. C'est ce que la branche de
  transition `data-piece` exige : la version d'origine de cette spec croyait que
  les pages déjà en production survivraient d'elles-mêmes à la bascule, ce qui
  est faux, `replace_tree()` remplaçant `www/wallpanel/` en entier.
- Le build publie `contrat/icones.json` et `contrat/budget.json`.
- Le hook dépose un troisième arbre, `custom_components/home_desk/`, exactement
  comme `vignette`. Il ne touche toujours aucun répertoire partagé, et il
  n'écrit toujours pas dans `configuration.yaml`.
- **Pas de hook `activate`** — décision intacte.

### Les gestes opérateur

Le geste n°3 change de contenu : la `startURL` devient
`/local/wallpanel/index.html?ecran=<nom>` — le nom de fichier est obligatoire,
cf. décision 9.

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
   qui épingle une version de HA et qu'il faudra suivre. Mesuré : elle impose
   **Python ≥ 3.14** ; le `python3` du système est 3.13.5, d'où le garde-fou de
   version qui imprime le geste complet
   (`make test-composant PYTHON=…/python3.14`).

**Une dette du plan 2, tranchée le 2026-09-13 : on la MESURE, on ne la répare
pas.** Le budget sait chiffrer un ordre de zones que le moteur d'animation n'a
jamais été mesuré pour rendre. Compté au schéma : **49 ordres valides**
(`commandes` obligatoire, `uniqueItems`) ; les trois écrans réels en utilisent
**un**. Le plan 3b passe les 49 ordres dans `verifier-rendu.mjs` et **rapporte**,
en ne corrigeant que ce qui casse. Si rien ne casse, la dette se raye avec un
chiffre ; sinon on saura quoi. « Une lacune sans risque se nomme, elle ne se
cloue pas. »

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

### Le défaut de la version d'origine, et ce qui le rachète

*Réécrit le 2026-09-13, après mesure.* La version d'origine disait : « déposer le
nouveau bundle **à côté** de l'ancien : `index.html` arrive, les trois
`<piece>.html` RESTENT en place », puis « repointer UNE tablette, vérifier, puis
les deux autres ». **Ce n'est pas ce qui se passe**, pour deux raisons mesurées :

1. `hooks/install.py:107`, `replace_tree()` — `copytree` vers `dest.new`,
   `os.replace(dest, dest.old)`, `os.replace(tmp, dest)`, `rmtree(old)` : le
   répertoire `www/wallpanel/` est remplacé **en entier, atomiquement**. C'est
   une décision de `CLAUDE.md` qu'on ne défait pas — « trois clients rechargent
   tout seuls ; deux gestes de dépôt y ouvriraient une fenêtre ».
2. `dist/salon.html` charge `<script src="/local/wallpanel/wallpanel.js?v=…">` —
   **un seul nom de fichier**, partagé par les trois pages ; le `?v=` n'est qu'un
   anti-cache.

**Donc, au moment où le nouveau bundle est déposé, les trois tablettes exécutent
le nouveau code à leur prochain rechargement, quelle que soit leur URL.** La
granularité du retour arrière est le BUNDLE, pas la tablette : telles quelles,
les étapes 5 à 7 n'en ont aucun.

**Ce qui le rachète — la branche de transition** (arbitrage du propriétaire,
2026-09-13). On fait en sorte que le MÊME bundle serve les deux chemins, parce
qu'il porte encore les deux sources :

- `index.ts` résout le nom d'écran dans cet ordre : `?ecran=<nom>` → **transport
  websocket** ; sinon `racine.dataset.piece` → **`ECRANS[…]`, le littéral, chemin
  inchangé** ; sinon la dégradation n°1.
- Les trois pages historiques restent produites par `generer-pages.mjs` et
  restent dans `dist/` jusqu'à l'étape 8.
- La branche `data-piece`, les littéraux, les trois pages, l'outil et ses trois
  épreuves partent **dans le même commit**, à l'étape 8.

Le retour arrière de l'étape 5 devient alors **réel** : remettre l'ancienne
`startURL` fait charger la page historique, qui prend la branche `data-piece`,
qui lit le littéral — le comportement d'avant, **octet pour octet**, puisque
c'est littéralement le même code. Coût : environ **huit lignes** dans
`index.ts`, datées, testées sur les deux chemins, et qui meurent avec le reste du
transitoire.

*Écarté* : deux noms de bundle (`wallpanel.js` figé + `wallpanel2.js`). Il
faudrait committer un binaire du code qu'on s'apprête à supprimer, et
réintroduire sciemment la dette « `dist/` embarque cette maison » pour toute la
durée de la migration.

**Les étapes 2 et 4 d'origine ne sont pas séparables.** Une installation
`nivuus` fait les trois dépôts en un seul passage : on ne peut pas déposer le
composant sans le bundle, sauf à le copier à la main — ce qui contournerait le
mécanisme qu'on est justement en train de valider. Elles fusionnent.

### L'ordre, et son retour arrière à chaque étape

| # | Geste | Ce qui est vérifié avant de passer à la suite | Retour arrière |
|---|---|---|---|
| **1** | **Filet et relevé.** Sauvegarde HA complète. Copie datée de `config/www/wallpanel/`. **Relever et écrire les trois `startURL` actuelles** et l'empreinte `?v=` servie. Archiver la version de paquet installée. | La sauvegarde est listée et non vide ; la copie porte 8 fichiers ; les trois URL sont écrites ; l'archive existe **hors** de la cible. | Sans objet — rien n'a changé. |
| **2** | **Dépôt du paquet de transition** : le commit qui porte ENCORE les littéraux, les trois pages historiques et la branche `data-piece`. Puis `check_config`, puis redémarrage HA. | `check_config` propre **avant** le redémarrage. HA remonte, l'intégration est proposée à l'ajout. **Et les trois pages historiques rendent à l'identique** — `verifier-rendu.mjs --deploye` plus une capture par tablette comparée à l'étape 1. C'est la preuve que rien n'a encore bougé. | Redéployer l'archive de l'étape 1, `check_config`, redémarrer. |
| **3** | **Créer l'intégration, vide.** Paramètres > Appareils et services > Tablettes murales. Aucun écran. | L'entrée existe ; `home_desk/ecrans` rend `[]` ; les trois tablettes sont inchangées. | Supprimer l'entrée de configuration. |
| **4** | **Importer les trois écrans** : déposer le YAML en `config/home_desk_ecrans.yaml`, appeler `home_desk.importer`. | **La porte de fidélité** : `home_desk/ecrans` rend trois lignes, `home_desk/ecran` rend chacune, et chaque objet rendu **égale le littéral correspondant** champ par champ, `version: 1` comprise — le niveau 1 ci-dessus, exécuté contre l'instance réelle et non contre le harnais. | `importer` est atomique et total : ré-importer un fichier corrigé, ou supprimer l'entrée (retour à l'étape 3). |
| **5** | **Repointer UNE tablette : la cuisine** — `fully_kiosk.set_config` (`startURL` → `/local/wallpanel/index.html?ecran=cuisine`), puis `button.tablette_cuisine_load_start_url`. L'écran le plus riche : minuteurs, recette, courses, `absenceNommee`. | L'écran se lève sans rester bloqué sur l'attente. Capture comparée à l'étape 1. `verifier-rendu.mjs` sur la nouvelle URL. **Les cinq dégradations sondées sur place**, en tapant les URL à la main. | `set_config` avec l'URL **relevée à l'étape 1** + rechargement → page historique → branche `data-piece` → littéral. |
| **6** | **Vivre avec, 24 heures.** | Aucun mur blanc, aucune tuile morte ; les minuteurs se lancent, la vue Recette s'ouvre, la liste de courses se coche. **Et l'épreuve propre à ce chantier** : éditer une tuile depuis HA et voir l'écran se recharger tout seul (`home_desk_config_changed`) — la promesse « édition vivante » se prouve ici, pas en test. | Identique à 5. |
| **7** | **Repointer le salon, puis le bureau**, un à la fois. Le salon porte la voiture et la DeLorean ; le bureau l'agenda et `todo.travail`. | Identique à 5, par tablette. | Identique à 5, par tablette. |
| **8** | **Le commit de retrait, puis le redéploiement.** Retirer les littéraux, l'outil, ses trois épreuves, les trois pages historiques, la branche `data-piece` ; basculer les 12 fichiers de tests sur les écrans de référence ; `npm run build` ; committer ; installer. | **Les trois suites vertes AVANT le déploiement** — attention, `test_dist_a_jour` relance `npm run build` et compare à HEAD **commité**. Après : les trois tablettes rechargent seules et rendent à l'identique. | **Redéployer l'archive de l'étape 1 en entier.** Pas « recopier trois HTML » : sans leur bundle d'époque, trois pages dont la branche `data-piece` n'existe plus donnent trois murs blancs. |

### Ce qui ne revient PAS en arrière

À dire avant de commencer, pas après.

1. **Le redémarrage de HA à l'étape 2** : une coupure brève de toute la maison,
   pas seulement des tablettes. Irréversible au sens où elle a lieu — l'heure se
   choisit à l'avance et s'écrit dans le dossier de production.
2. **À partir de l'étape 2, la granularité du retour arrière est le bundle**, et
   elle n'est rachetée par tablette que par la branche `data-piece`. Sans cette
   branche, les étapes 5, 6 et 7 perdent tout retour arrière et la mise en
   production redevient une bascule unique.
3. **Le retour arrière Fully est asynchrone** : une tablette hors ligne garde son
   URL neuve jusqu'à son retour. Le pire cas est une tablette qui redémarre sur
   la nouvelle URL après qu'on a décidé de revenir en arrière.
4. **Après l'étape 8, l'archive de l'étape 1 est le seul chemin de retour.** La
   garder, avec la sauvegarde HA, au moins une semaine. Un `git revert` suffit
   pour le dépôt, mais il exige de reconstruire `dist/` et de redéployer : ce
   n'est plus un retour arrière, c'est un nouveau déploiement.
5. **Ce que l'outil n'a pas attaché** : les commentaires classés « orphelins »
   restent dans `git log` mais quittent le système vivant. Récupérables, jamais
   sous les yeux de qui édite le réglage. C'est la régression n°3, et le registre
   est ce qui la rend chiffrable au lieu de vague.

---

## Ce qui reste ouvert

- Le nombre d'écrans de référence dans `tests/aides.ts` (trois, comme
  aujourd'hui ? un seul, riche ?) — à trancher en écrivant le plan.
- Le format exact de `contrat/budget.json` : liste de hauteurs nommées, ou
  formule. À trancher en mesurant ce dont `combien()` a réellement besoin.
- Faut-il une commande websocket pour ÉCRIRE la config depuis la tablette (une
  vue « Réglages » sur l'écran) ? Hors périmètre ici, mais l'architecture ne
  l'interdit pas — c'est un service de plus sur le même composant.
- **À RE-MESURER AVANT D'ÉCRIRE LE DOSSIER DE PRODUCTION** : cette spec affirme
  que `fully_kiosk.set_config` accepte la clé `startURL` sur cette instance,
  mesuré le 2026-09-12. Ce fait n'a pas été revérifié depuis, et **tout le retour
  arrière des étapes 5 et 7 repose dessus**. C'est la première chose à confronter
  à l'instance quand le plan 3c s'ouvrira.
- Les **IP des trois tablettes** (`192.168.0.159`/`.218`/`.138`) apparaissent
  dans des fichiers livrés par `git archive` — dont `app/src/styles/base.css`,
  la SOURCE dont `dist/wallpanel.css` est bâti — et **aucune garde ne les
  cherche** : `tests/test_dist_portable.py` ne connaît que deux chemins de
  fichier, et `app/` n'est scanné par aucune garde de portabilité. Dette
  antérieure à ce chantier, à trancher au plan 3c en même temps que les quinze
  `entity_id` résiduels de l'objectif 1.
