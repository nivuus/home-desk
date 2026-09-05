# Recette du repas suivant — tablette cuisine

**Date** : 2026-08-17
**Portée** : `src/grocy.ts` (nouveau), `src/repas.ts` (nouveau), `src/rendu/recette.ts` (nouveau),
`src/rendu/defaut.ts`, `src/rendu/corps.ts`, `src/pieces.ts`, `src/modes.ts`, `src/interaction.ts`,
`src/demarrage.ts`, `src/styles/base.css`, `outils/verifier-rendu.mjs`
**Statut** : conception validée par le propriétaire, implémentation à planifier

## Problème

La tablette cuisine affiche le plat du jour dans son bloc central (`rendreRepas`, `rendu/defaut.ts`,
alimenté par `todo.grocy_meal_plan`) et propose à côté une tuile « Recettes » qui ouvre la page
autonome `/local/grocy-recipes.html` — le **catalogue des 79 recettes**. Les deux ne sont pas reliés :

1. Le bloc nomme le plat mais n'ouvre rien : c'est un `<div>` d'affichage.
2. La tuile ne dit pas ce qui est prévu, et mène à une liste où il faut retrouver à la main le plat
   qu'on vient de lire juste au-dessus.
3. La page autonome sort de l'application : autre langage visuel, navigation au **swipe** (interdite
   sur ces dalles), minuteurs qui écrasent toujours `timer.cuisine` en ignorant les trois créneaux de
   l'app, et aucun retour vers l'accueil.

Deux limites de la source actuelle interdisent par ailleurs de parler de « repas suivant » :
`todo.grocy_meal_plan` **ne porte ni section ni heure** (l'intégration ne mappe que `day`, `summary`,
`description` — cf. `custom_components/grocy/todo.py`), et Home Assistant marque `completed` tout ce
qui est à `J+1` ou plus (`_calculate_item_status`), que `Connexion.listerTaches` filtre. L'app ne voit
donc que le jour courant : après le dîner, il n'y a plus rien à montrer.

## Décisions

| Question | Décision | Raison |
|---|---|---|
| Source de données | **API Grocy directe** (`http://192.168.0.1:9283`) | Seule à porter la section et son heure (`meal_plan_sections.time_info`) ; sans clé, `Access-Control-Allow-Origin: *` (vérifié), déjà la voie de `grocy-recipes.html` |
| Nom du plat | **Dans le bloc central**, tuile à libellé court | Une tuile fait ~160 px avec `.t` en 14 px : « Bol légumes rôtis-pois chiches-œuf » y serait tronqué ; le bloc a deux lignes pleine largeur |
| Portée de la vue | **Le repas suivant, rien d'autre** | Le catalogue reste dans la page autonome ; pas de troisième niveau de profondeur |
| Retour automatique | **Exempté des 45 s**, repli 30 min | On cuisine en s'éloignant du plan de travail ; le repli garde l'écran mural honnête |
| Réduire / réafficher | **Nouveau mode principal `recette`**, prioritaire sur tout sauf `alerte` | Le mode `minuteur` n'affiche AUCUNE commande (630 px mesurés) : sans cette préséance, lancer un minuteur ferait disparaître le seul point de reprise |
| Page trop longue | **Sous-découpage automatique** mesuré dans le navigateur | La pire page du catalogue fait 454 caractères + image ≈ 700 px pour 585 disponibles ; ni geste de défilement, ni contenu hors champ |
| Fonctions portées | Minuteurs inline, ingrédients + stock, retrait du stock, images | Choix explicite du propriétaire : tout ce que fait la page autonome |
| Persistance de l'étape | **`localStorage`**, oubli après 4 h | Android tue régulièrement l'app sur ces Fire ; l'étape ne doit pas mourir avec elle |

## Conception

### 1. Lecture Grocy — `src/grocy.ts`

Un module isolé, construit par fabrique (`creerGrocy({ fetch, base })`) pour rester injectable dans
les tests, exactement comme `cx`/`d` ailleurs. Deux lectures seulement :

| Fonction | Appels | Quand |
|---|---|---|
| `chargerPlan()` | `/api/objects/meal_plan`, `/api/objects/meal_plan_sections`, `/api/objects/recipes` | Au démarrage, toutes les 15 min (cadence actuelle de `chargerRepas`), et à l'ouverture de `#recette` |
| `chargerIngredients(recipeId)` | `/api/objects/recipes_pos`, `/api/objects/products`, `/api/objects/quantity_units`, `/api/stock` | À l'ouverture du panneau ingrédients, et après chaque retrait de stock |

**Ne lève jamais** : toute erreur (réseau, JSON malformé, Grocy arrêté) rend `undefined` ou un tableau
vide, et le dernier plan connu est conservé — même discipline que `chargerMeteo`/`chargerRepas`
(`demarrage.ts`). Conséquence visible : le bloc et la tuile disparaissent, l'écran vit.

`base` est **résolue depuis l'origine de la page**, jamais figée — même règle que le `isRemote` de
`grocy-scanner.html` :

| Origine de la page | Base Grocy |
|---|---|
| `http://192.168.0.1:8123` (les 3 tablettes, relevé Fully) | `http://192.168.0.1:9283` |
| `https://home.allanic.me` (accès distant) | `https://grocy.allanic.me` |

Sans cette résolution, une page servie en HTTPS verrait son `fetch` en clair bloqué comme contenu
mixte. Les deux hôtes répondent sans clé et autorisent l'origine correspondante (`Access-Control-Allow-Origin`
vérifié sur les deux).

Les **écritures** ne passent pas par Grocy : elles restent des services Home Assistant appelés sur le
websocket existant (`grocy.consume_product_from_stock`, `grocy.consume_recipe`, `timer.*`,
`input_text.set_value`), donc soumises au garde `estHorsLigne` comme toute autre commande.

### 2. Le repas suivant — `src/repas.ts`

Module **pur** (aucune I/O, horloge reçue en paramètre), seul détenteur de la règle :

```ts
type RepasSuivant = {
  uid: string;             // id de l'entrée meal_plan (clé de persistance)
  etiquette: string;       // « Dîner · 20 h », « Demain, déjeuner · 12 h 30 »
  plat: string;            // recipe.name, ou le texte de la note
  pages?: string[];        // les blocs .page-recipes ; absent pour une note
};
```

- **Horodatage** d'une entrée = `day` + `time_info` de sa section (Petit-déjeuner 07:30, Déjeuner
  12:30, Dîner 20:00). Une section sans heure (`id: -1`, qui existe dans le plan) est placée en fin de
  journée (23:59) plutôt qu'ignorée.
- Les entrées `done: 1` sont écartées.
- « Suivant » = la **première entrée dont l'horodatage n'est pas passé**, en balayant chronologiquement
  aujourd'hui puis les jours suivants. À 14 h on montre le dîner ; à 23 h, le premier repas de demain.
- **Marge de grâce de 2 h** : un repas reste « suivant » jusqu'à 2 h après son heure. Sans elle, à
  20 h 01 l'écran basculerait sur le petit-déjeuner de demain alors qu'on est précisément en train de
  préparer le dîner — le pire moment pour perdre la recette de l'écran. 2 h couvre une préparation
  longue sans jamais chevaucher le repas suivant (le plus rapproché est déjeuner 12:30 → dîner 20:00).
- `type: 'note'` (les « restes » : *Reste quinoa + légumes rôtis*) → `plat` = le texte de la note,
  **pas de `pages`** : rien à ouvrir, donc bloc non touchable et tuile masquée.
- `type: 'product'` → même traitement qu'une note, avec le nom du produit. Aucun aujourd'hui.
- Une entrée `recipe` dont la recette est introuvable est **sautée** : afficher « Unknown recipe »
  (ce que produit l'intégration HA aujourd'hui) serait un mensonge à l'écran.
- Plan épuisé (le plan courant s'arrête au 31/08) → `undefined`, et le bloc central retombe sur son
  remplaçant, contrat déjà en place.

L'abréviation « Petit-déj. » est utilisée dans l'étiquette d'un repas de demain, pour tenir sur une ligne.

### 3. Accueil : le bloc et la tuile

**Bloc central** — `rendreRepas(items)` devient `rendreRepasSuivant(r: RepasSuivant)` :
`.t` = `r.etiquette`, `.v` = `r.plat` (borné à deux lignes, `-webkit-line-clamp` existant),
`data-mvt="bloc:repas"` conservé. Touchable (`@pointerdown` → `location.hash = '#recette'`)
**uniquement si `r.pages` existe** — même patron que `.synthese`, qui ouvre déjà `#taches` sans
chevron : l'affordance est portée par la tuile, pas par une décoration.

**Tuile** — dans `pieces.ts`, `{ libelle: 'Recettes', lien: '/local/grocy-recipes.html' }` devient
`{ libelle: 'Recette', icone: 'book', entite: 'todo.grocy_meal_plan', vue: '#recette' }`.
`entite` reste `todo.grocy_meal_plan` : c'est l'indicateur de disponibilité Grocy déjà exploité par le
masquage générique (`estUtilisable`, `rendu/corps.ts:344`), et il ne coûte aucune lecture nouvelle.

**Nouveau champ `Bouton.vue?: string`**, distinct de `lien` qui reste réservé aux pages autonomes
(le Scanner de « Toute la maison »). `interaction.ts` le traite en premier, avant `lien` :

```ts
if (b.vue) { location.hash = b.vue; return; }
```

**Masquage de la tuile** quand il n'y a pas de recette ouvrable (note, plan épuisé) :
`rendreCorps(..., recetteOuvrable = false)`, paramètre optionnel en dernière position — patron exact
de `masquerEntretien` — qui filtre les boutons portant `vue === '#recette'`. `demarrage.ts` le décide
sur ce qui est RÉELLEMENT affiché, comme il le fait déjà pour `masquerEntretien`.

### 4. Mode `recette` — la recette réduite

`ContexteModes` reçoit `recetteReduite?: { etape: number; total: number; plat: string }`.
Nouvelle priorité dans `modePrincipal` :

```
alerte > recette > minuteur > menage > cinema > media > aeration > voiture > defaut
```

`alerte` garde la tête : une porte déverrouillée passe devant une recette. `combien('recette')` = **4**,
comme `defaut` — le bloc réutilise le gabarit `.mode-bloc`, donc le budget de hauteur ne bouge pas.

Bloc rendu (`rendreRecetteReduite`, `rendu/defaut.ts`) :

- `.t` = « Étape 2/3 » — une « étape » est une page de la recette, jamais un découpage propre à l'app —
  suivi de « · ⏱ 7:32 » quand un minuteur tourne : le plus urgent, lu par `listerMinuteurs`
  (`minuteurs.ts`). Aucun doublon : `tuileMinuteur` n'affiche que le mot « Minuteur », jamais un
  décompte (`rendu/minuteur.ts:145`).
- `.v` = le nom du plat.
- Touchable → rouvre `#recette` **à la page mémorisée**.

Conséquence assumée : pendant une recette réduite, la **liste détaillée des trois minuteurs**
n'occupe plus le bloc central. Elle reste à un appui par la tuile « Minuteur » de la rangée Ambiance,
et le décompte le plus urgent est repris dans le bloc.

**Quand `alerte` confisque le bloc central** (porte déverrouillée pendant la cuisson), la reprise n'est
pas perdue : ce mode laisse quatre commandes, donc la tuile « Recette » reste affichée et rouvre la
recette en cours. C'est la raison pour laquelle la tuile n'est pas supprimée au profit du seul bloc.

### 5. La vue `#recette` — `src/rendu/recette.ts`

Deuxième niveau de profondeur, comme `#taches`/`#maison`/`#minuteur`. Structure et budget :

| Zone | Hauteur | Contenu |
|---|---|---|
| `.etiquette` + titre | ~64 px | « Dîner · 20 h » + « 2/4 » à droite ; nom du plat en dessous |
| `.recette-page` | le reste (~395 px) | La page courante de la recette |
| Rangée pagination | 62 px | `◀` et `▶`, désactivés aux extrémités |
| Rangée actions | 62 px | `☰ Ingrédients` · `↩ Réduire` · `✓ Terminer` (3 × ~114 px de large) |

Aucun swipe, aucune sortie implicite : trois boutons, trois intentions distinctes.

**Assainissement du HTML** (`assainir()`, testable sans navigateur) — les descriptions Grocy portent
des couleurs en dur (`color:#555`, `color:#333`) illisibles sur fond sombre, que le contrôle de
contraste 5:1 rejetterait, et des images de 200 à 250 px :

- suppression des déclarations `color`/`background` inline (les jetons M3 reprennent la main) ;
- images plafonnées à **140 px** de haut, `object-fit: cover`, largeurs fixes retirées ;
- `<script>`, `<style>` et attributs `on*` retirés — le HTML est local, mais rien d'exécutable n'entre ;
- structure conservée telle quelle (`h3`, `p`, `ol`, `li`, `strong`, `span`).

**Sous-découpage automatique** : après rendu, tant que le contenu dépasse la zone, les derniers
enfants de premier niveau sont reportés sur une sous-page. La coupe tombe **entre deux éléments**,
jamais au milieu d'un `<li>` ou d'un paragraphe ; la numérotation reste continue (« 2/4 »). Mesuré
avec `scrollHeight`/`clientHeight`, donc **invisible à jsdom** : seul `verifier-rendu.mjs` en fait foi.

**Minuteurs inline** : un tag `#nom:secondes` du texte devient un bouton `⏱ 3:00` (≥ 62 px).

- Appui → `premierSlotLibre(etat, slots())` (`minuteurs.ts`), puis `timer.start` sur ce créneau et
  `input_text.set_value` avec le nom du tag comme étiquette. Les trois créneaux sont donc exploités,
  au lieu d'écraser toujours `timer.cuisine`.
- Aucun créneau libre → bouton en état `inactif`, comme `tuileMinuteur(sature)`.
- Le décompte affiché est **l'état HA du créneau** dont l'étiquette correspond au tag (via
  `listerMinuteurs`/`tictacMinuteurs`, déjà en place) — pas un compte à rebours local, qui pourrait
  mentir après un rechargement de la WebView.
- Réappui sur un minuteur en marche → `timer.pause` ; reprise → `timer.start` avec une durée
  recalculée, **jamais `timer.change`** (HA refuse `beyond duration`, piège déjà payé ici).

**Panneau ingrédients** : recouvre la zone de contenu dans la même vue (pas de troisième hash).
Une ligne par ingrédient (≥ 62 px) : nom, quantité nécessaire, stock réel en vert/rouge, bouton
« Retirer ». `Retirer` et `Retirer tout` sont **destructifs** ⇒ deux appuis chacun, via l'armement
existant de `cochage.ts` (jamais d'appui long). Appels : `grocy.consume_product_from_stock` et
`grocy.consume_recipe` par `cx.appelerService`, donc inertes hors ligne comme le reste.

### 6. Navigation, réduction et persistance

`demarrage.ts` sépare deux familles de sous-vues :

| Vue | Retour automatique | Effet |
|---|---|---|
| `#maison`, `#taches`, `#minuteur` | 45 s (`RETOUR_MS`, inchangé) | Retour à l'accueil |
| `#recette` | **30 min** | **Réduction** : retour à l'accueil, la recette reste en cours |

`#recette` rejoint `estSousVue` pour l'animation de traversée du moteur de mouvement, mais pas pour le
minuteur court : c'est une famille distincte, pas une exception glissée dans la première.

**Ce que `#recette` ouvre**, sans ambiguïté : la recette **en cours** si `localStorage` en contient une
valide, sinon celle du repas suivant. Le bloc et la tuile visent donc toujours la même chose, y compris
quand les deux divergent — on réduit le dîner à 19 h, à 21 h le repas suivant devient le petit-déjeuner
de demain, et la tuile continue de rouvrir le dîner tant qu'on n'a pas touché « Terminer ».

Persistance dans `localStorage` sous `wallpanel_recette` : `{ uid, page, majLe }`, réécrit à chaque
changement de page (comme le fait déjà `grocy_recipe_state` dans la page autonome). Relu au démarrage
et **ignoré** si `majLe` dépasse 4 h ou si `uid` a disparu du plan — sans quoi l'écran mural resterait
des jours sur la recette d'avant-hier. « Terminer » efface la clé et rend le bloc au repas suivant.

### 7. Budget de hauteur

Aucune tuile ni rangée ajoutée sur l'accueil : quatre commandes avant comme après, même gabarit
`.mode-bloc` pour le bloc central. Le mode `recette` **remplace** un mode existant, il ne s'empile pas
sur lui ; sa mesure de référence est celle du mode `defaut` (574 px relevés en tâche 19). Tout chiffre
de ce lot doit venir de `verifier-rendu.mjs` — une maquette ne mesure rien.

## Tests

`vitest`, un fichier par unité, dans le style des 33 existants :

| Fichier | Cas |
|---|---|
| `tests/repas.test.ts` | Choix du repas suivant à 11 h / 14 h / 21 h ; entrée `done` écartée ; note sans `pages` ; section sans `time_info` rangée en fin de journée ; recette introuvable sautée ; plan épuisé → `undefined` ; étiquette « Demain, … » |
| `tests/grocy.test.ts` | Assemblage des trois lectures du plan ; `fetch` qui rejette → dernier plan conservé ; JSON malformé → pas de lever ; ingrédients + stock fusionnés |
| `tests/recette.test.ts` | Découpage sur `.page-recipes` ; description sans bloc → une page ; assainissement (couleurs retirées, image plafonnée, `on*` retiré) ; tags `#nom:secondes` → bouton ; créneau saturé → bouton inactif ; pause puis reprise par `timer.start` recalculé |
| `tests/modes.test.ts` (existant) | `recette` prime sur `minuteur`/`media`/`cinema` ; `alerte` prime sur `recette` ; `combien('recette') === 4` |
| `tests/defaut.test.ts` (existant) | `rendreRepasSuivant` : bloc touchable avec `pages`, inerte sur une note ; `rendreRecetteReduite` : « Étape 2/3 · ⏱ 7:32 », sans décompte quand aucun minuteur ne tourne |
| `tests/pieces.test.ts`, `tests/corps.test.ts` (existants) | Tuile « Recette » déclarée avec `vue` ; masquée quand `recetteOuvrable` est faux |
| `tests/interaction.test.ts` (existant) | `b.vue` pose le hash sans appeler aucun service ; `b.lien` inchangé |
| `tests/navigation.test.ts` (existant) | `#recette` exemptée du retour de 45 s ; repli 30 min ; persistance relue/ignorée selon `majLe` |

## Vérification

1. `npm test` (depuis `tools/wallpanel-app`).
2. `node outils/verifier-rendu.mjs` — deux vues ajoutées à la boucle : `#recette` sur la **page la plus
   longue du catalogue** (454 caractères + image, celle qui doit déclencher le sous-découpage) et
   l'accueil cuisine en **mode recette réduite**, alimentés par une injection façon `__injecterRepas`.
   C'est ce script qui juge le débordement, les cibles 62 px, le contraste 5:1 et le texte tronqué.
3. `npm run build` (déploie dans `config/www/wallpanel/`).
4. `button.tablette_cuisine_vider_le_cache_du_navigateur` puis `button.tablette_cuisine_load_start_url`.
5. Contrôle visuel sur `image.tablette_cuisine_capture_d_ecran` — se fier à l'horloge affichée, pas à
   `frame_timestamp`.

## Hors périmètre

- **Le catalogue des 79 recettes dans l'app** : `grocy-recipes.html` reste la référence, inchangée, et
  son bouton « Scanner » dans « Toute la maison » n'est pas touché.
- Le salon et le bureau : ni l'un ni l'autre ne déclare `blocDefaut: 'repas'`.
- Toute **édition** du plan de repas depuis la tablette (cocher un repas comme fait, changer de plat).
- Un portage sur `todo.grocy_meal_plan` : écarté faute de section, d'heure et de visibilité au-delà du
  jour courant (cf. Problème).
- Un proxy Grocy côté Home Assistant : inutile, `grocy.allanic.me` couvre déjà l'accès en HTTPS (cf. §1).
- L'entrée en stock au scan (produits, OpenFoodFacts, emplacements) : lot séparé, cf.
  `2026-08-17-scan-entree-stock-design.md`.
