# Entrée en stock au scan — OpenFoodFacts et emplacement

**Date** : 2026-08-17
**Portée** : `src/scan/` (nouveau : `camera.ts`, `decodeur.ts`, `off.ts`, `rangement.ts`, `file.ts`),
`src/rendu/scan.ts` (nouveau), `src/grocy.ts` (étendu — cf. lot recette),
`src/pieces.ts`, `src/demarrage.ts`, `src/styles/base.css`,
`config/www/wallpanel/scan.html` (nouvelle page, générée par le build), `outils/verifier-rendu.mjs`
**Statut** : conception validée par le propriétaire, implémentation à planifier
**Lot frère** : `2026-08-17-recette-repas-suivant-design.md` (partage `src/grocy.ts`)

## Problème

Ranger les courses passe aujourd'hui par `/local/grocy-scanner.html`, une page autonome de 36 Ko qui
décode les codes-barres (`html5-qrcode` + `BarcodeDetector` natif + service de décodage local sur
`:9284`), reconnaît des produits par Gemini, cherche une date de péremption et ajoute au stock via
`/api/stock/products/by-barcode/<code>/add`, avec repli sur
`/api/stock/barcodes/external-lookup/<code>?add=true` — le pont OpenFoodFacts de Grocy.

Deux manques :

1. **L'emplacement n'est jamais demandé.** Grocy crée le produit dans son emplacement par défaut, et
   personne ne corrige après coup. Constat sur l'installation : les **8 derniers produits créés sont
   tous en Frigo**, dont « Curry en poudre », « Lentilles corail » et « Shampooing kétoconazole 2 % ».
   Les quatre emplacements existent pourtant (Frigo 2, Congélateur 3, Placard 4, Autre 5) et
   l'historique est correct (123 produits au Placard, 62 au Congélateur) : c'est le flux de scan qui
   ne pose pas la question.
2. **L'enrichissement est réduit au nom.** Le plugin `OpenFoodFactsBarcodeLookupPlugin` de Grocy ne
   remplit en pratique que `name`, alors que l'API OFF renvoie 289 champs pour un code-barres :
   nom FR, marque, quantité, catégories taguées, photo, Nutri-Score, NOVA, Eco-Score, allergènes,
   ingrédients (vérifié sur `3560070825493` → « Fusilli Blé complet », Carrefour, 500 g, `en:pastas`,
   Nutri-Score A, NOVA 1).

## Décisions

| Question | Décision | Raison |
|---|---|---|
| Où vit le flux | **Dans l'app wallpanel** (`src/scan/`, vue `#scan`) | Choix du propriétaire : un seul langage visuel, un seul dépôt, les règles de l'app (62 px, deux appuis, jetons M3) s'appliquent |
| Appareils visés | **Tablette murale ET téléphone** | Les deux servent selon le moment ⇒ deux cadres, une base de code |
| Décodage | **`BarcodeDetector` natif, repli service `:9284`, puis Gemini** | Stratégie déjà éprouvée par `grocy-scanner.html` sur ce matériel ; rien à réinventer |
| Données OFF | **Champs natifs Grocy + userfields dédiés** | `calories`, photo, groupe, emplacement ont un champ ; le reste devient filtrable dans l'UI Grocy sans toucher aux descriptions écrites à la main (214 sur 336) |
| Unité de stock | **Jamais déduite d'OFF** | L'unité est un choix humain : 131 produits en « Pièce », puis Boîte, Paquet, Pot. « 500 g » va dans `off_quantite`, pas dans `qu_id_stock` |
| Emplacement | **Deviné, mis en avant, surchargeable en un appui** | Un geste pour confirmer, un geste pour corriger ; rien n'est écrit avant l'appui |
| Règle de devinette | **Un seul mapping OFF → groupe de produits Grocy, puis groupe → emplacement** | Les 20 groupes français existent déjà (Viande, Fromage, Surgelé, Pâtes, Épice, Ménage…) ; deux tables dériveraient l'une de l'autre |
| Défaut sans information | **Placard**, jamais Frigo | Le défaut actuel est la cause du problème constaté ; un placard qui se trompe ne gâche pas un aliment |

## Conception

### 1. Vue `#scan` — deux cadres, une base de code

La vue vit dans l'app et se rend dans deux contextes :

| Contexte | Page | Cadre |
|---|---|---|
| Tablette murale (cuisine) | `cuisine.html`, vue `#scan` | 343 × 585 px, contraintes habituelles |
| Téléphone | **`scan.html`** (nouvelle page du build) | Pleine hauteur, une seule colonne, mêmes composants |

`scan.html` est un artefact de build comme les pages de pièce : elle charge le même bundle et n'affiche
que cette vue. Le cadre est le seul écart — **aucune règle n'est relâchée** sur le téléphone (cibles
≥ 62 px, deux appuis pour le destructif, jetons M3).

**Cette vue ne dépend pas du websocket Home Assistant** : toutes ses écritures vont à Grocy en REST, et
elle ne lit aucune entité. Elle fonctionne donc même sans session HA authentifiée — utile sur le
téléphone, où le jeton du navigateur n'est pas garanti. Seule conséquence : pas de garde `estHorsLigne`
ici, c'est l'échec d'un appel Grocy qui est rapporté, produit par produit.

Point d'entrée sur la tablette : la tuile **« Scanner »** de « Toute la maison » (déjà déclarée dans
`piece.extrasMaison` en cuisine) cesse d'ouvrir la page autonome et pointe `vue: '#scan'` — le champ
`Bouton.vue` introduit par le lot recette.

### 2. Caméra et décodage — `src/scan/camera.ts`, `src/scan/decodeur.ts`

Trois niveaux, dans cet ordre, repris de la page autonome :

1. **`BarcodeDetector` natif** sur les images de `getUserMedia` (formats EAN-13/EAN-8/UPC).
2. **Service de décodage local** (`POST http://192.168.0.1:9284/decode`, `https://grocy.allanic.me/decode`
   en distant) après un seuil d'échecs client, avec intervalle minimum entre deux envois.
3. **Gemini** (`/decode/gemini`) pour reconnaître un produit sans code-barres lisible, et pour deviner
   nom et emplacement d'un produit qu'OFF ne connaît pas — cas réel : le « Shampooing kétoconazole »,
   absent d'OpenFoodFacts.

**Risque à lever en premier, avant tout le reste** : Fully occupe déjà la caméra des tablettes pour sa
détection de mouvement (`binary_sensor.tablette_cuisine_mouvement`, `motionFps` réglé à 2). Il faut
vérifier sur la vraie tablette que `getUserMedia` obtient le flux, et si la détection de mouvement
survit. Si la caméra n'est pas partageable, le repli est le téléphone (`scan.html`) — la conception
tient dans les deux cas, mais la réponse conditionne l'utilité de la vue sur la dalle murale.

La caméra n'est **allumée que dans la vue `#scan`** et relâchée à la sortie : un écran mural qui filme
en permanence coûterait de la batterie sur des dalles qui s'arrêtent déjà toutes seules le soir.

### 3. Enrichissement OpenFoodFacts — `src/scan/off.ts`

`GET https://world.openfoodfacts.org/api/v2/product/<code>.json`, avec un `User-Agent` explicite comme
le demande OFF. Champs retenus (les seuls lus parmi les 289) :

| Champ OFF | Destination Grocy |
|---|---|
| `product_name_fr` ou `product_name` | `name` (si le produit est créé) |
| `brands` | userfield `off_marque` |
| `quantity` (« 500 g ») | userfield `off_quantite` — **jamais `qu_id_stock`** |
| `categories_tags` | userfield `off_categories` + choix du groupe (§4) |
| `image_front_url` | `picture_file_name`, après téléversement sur `/api/files/productpictures/<nom>` |
| `nutriments['energy-kcal_100g']` | champ natif `calories` |
| `nutriscore_grade`, `nova_group`, `ecoscore_grade` | userfields `off_nutriscore`, `off_nova`, `off_ecoscore` |
| `allergens` | userfield `off_allergenes` |
| `ingredients_text_fr` | userfield `off_ingredients` |

Les **9 userfields** (`entity: products`) sont créés une fois via `POST /api/objects/userfields`, par un
script d'amorçage (`scripts/creer-userfields-grocy.mjs`) idempotent : il vérifie l'existence avant de
créer, et ne touche à rien d'autre. Aucun userfield n'est défini aujourd'hui dans cette installation.

**`description` n'est jamais écrite** : 214 produits sur 336 en ont une, écrite à la main.

OFF muet (produit inconnu, réseau coupé) ⇒ on continue sans enrichissement : nom via Gemini ou saisi,
emplacement demandé comme d'habitude. Rien ne bloque une entrée en stock.

### 4. Devinette de l'emplacement — `src/scan/rangement.ts`

Module **pur**, deux étapes enchaînées, une seule table à maintenir :

**Étape 1 — `categories_tags` OFF → groupe de produits Grocy** (les 20 groupes existants, jamais un
nouveau, sinon la liste dérive) :

| Tags OFF (préfixes) | Groupe Grocy |
|---|---|
| `en:frozen-*`, `en:ice-cream` | Surgelé |
| `en:cheeses` | Fromage |
| `en:dairies`, `en:yogurts`, `en:milks` | Produit laitier |
| `en:meats`, `en:poultry` | Viande · `en:charcuteries` → Charcuterie |
| `en:fishes`, `en:seafood` | Poisson |
| `en:eggs` | Œufs |
| `en:fresh-vegetables`, `en:vegetables` | Légume · `en:fruits` → Fruit |
| `en:pastas`, `en:cereal-pastas` | Pâtes · `en:breakfast-cereals`, `en:rices` → Céréale |
| `en:condiments`, `en:sauces` | Condiment · `en:spices` → Épice |
| `en:breads`, `en:viennoiseries` | Boulangerie |
| `en:beverages` | Boisson |
| `en:snacks`, `en:biscuits`, `en:chocolates` | Snack |
| `en:groceries`, `en:canned-foods`, `en:legumes` | Épicerie |
| `en:cleaning-products`, non alimentaire | Ménage |
| aucun tag reconnu | *(pas de groupe)* |

**Étape 2 — groupe → emplacement** :

| Groupe | Emplacement |
|---|---|
| Surgelé | Congélateur (3) |
| Fromage, Produit laitier, Viande, Charcuterie, Poisson, Œufs, Légume, Fruit | Frigo (2) |
| Pâtes, Céréale, Condiment, Épice, Boulangerie, Boisson, Snack, Épicerie | Placard (4) |
| Ménage, Ustensile | Autre (5) |
| *(pas de groupe)* | Gemini, puis **Placard** en dernier recours |

Le repli Gemini reçoit le nom du produit et rend un des quatre emplacements ; s'il échoue ou répond
autre chose, c'est Placard. **Jamais Frigo par défaut** — c'est précisément le comportement actuel qui
a mis le curry et le shampooing au frais.

`should_not_be_frozen` est renseigné pour les groupes Frigo issus de produits frais, ce qui fait
apparaître l'avertissement natif de Grocy si on tente de les congeler plus tard.

### 5. Le flux, écran par écran — `src/rendu/scan.ts`, `src/scan/file.ts`

```
[caméra]  →  code-barres détecté
              │
              ├─ produit déjà connu de Grocy (33 codes-barres enregistrés)
              │     → ajout direct au stock, emplacement déjà défini, toast « +1 »
              │       (on ne redemande jamais où va un produit déjà rangé)
              │
              └─ produit inconnu
                    → création : nom OFF/Gemini, userfields, photo, calories, groupe
                    → mise en file d'attente pour rangement
```

**La file** (`src/scan/file.ts`) permet de scanner à la chaîne les mains prises, puis de trancher : les
produits en attente s'empilent et la vue présente le premier. Chaque entrée affiche nom, marque,
quantité, Nutri-Score/NOVA quand ils existent, puis les quatre emplacements en boutons — celui deviné
en avant. Un appui écrit `location_id` et vide l'entrée de la file ; **rien n'est écrit avant cet
appui**, donc quitter la vue ne range rien de travers.

La date de péremption (`startExpirySearch` de la page autonome, Gemini) reste dans le flux, après
l'emplacement, et garde son caractère facultatif : on peut valider sans date.

**Écritures Grocy** — toutes par appels REST directs (l'API Grocy n'a pas de service HA équivalent
pour créer un produit) : `POST /api/objects/products`, `PUT /api/objects/products/<id>`,
`POST /api/stock/products/<id>/add`, `POST /api/files/productpictures/<nom>`. Le retrait de stock du
lot recette, lui, continue de passer par les services HA `grocy.*`.

### 6. Ce que devient la page autonome

`grocy-scanner.html` **reste en place, inchangée** : c'est le filet de retour arrière tant que la vue
`#scan` n'a pas prouvé qu'elle décode aussi bien sur les deux appareils. Elle sera retirée dans un lot
ultérieur, une fois la nouvelle vue éprouvée — pas dans celui-ci.

## Tests

| Fichier | Cas |
|---|---|
| `tests/rangement.test.ts` | Chaque famille de tags → groupe attendu ; groupe → emplacement ; tags inconnus → Gemini puis Placard ; **jamais Frigo par défaut** ; Gemini qui répond n'importe quoi → Placard |
| `tests/off.test.ts` | Extraction des 9 champs ; `product_name_fr` préféré à `product_name` ; produit absent (`status: 0`) → pas d'enrichissement, pas de lever ; réseau coupé → idem ; `qu_id_stock` jamais touché |
| `tests/scan-file.test.ts` | Empilement de plusieurs produits ; rien n'est écrit avant l'appui d'emplacement ; sortie de vue → file conservée ; produit déjà connu → ajout direct sans passer par la file |
| `tests/decodeur.test.ts` | Bascule `BarcodeDetector` → service de décodage après le seuil d'échecs ; intervalle minimum respecté ; anti-rebond du même code |
| `tests/scan-rendu.test.ts` | Emplacement deviné mis en avant ; les 4 boutons présents ; libellés courts non tronqués ; hors ligne → boutons inertes |
| `tests/pieces.test.ts` (existant) | La tuile « Scanner » pointe `vue: '#scan'`, plus `lien` |

## Vérification

1. **D'abord le risque caméra** : ouvrir `#scan` sur la vraie tablette cuisine et vérifier que
   `getUserMedia` obtient le flux malgré la détection de mouvement de Fully — et que
   `binary_sensor.tablette_cuisine_mouvement` survit. Ce point conditionne l'intérêt de la vue sur la
   dalle murale ; il se teste avant d'écrire le reste.
2. `npm test`.
3. `node outils/verifier-rendu.mjs` — vue `#scan` ajoutée dans les deux cadres (dalle 343 × 585 et
   cadre téléphone), avec un produit injecté en file d'attente.
4. **Amorçage** : `node scripts/creer-userfields-grocy.mjs` (idempotent) avant le premier scan.
5. `npm run build`, purge du cache de la tablette, contrôle sur `image.tablette_cuisine_capture_d_ecran`.
6. **Recette de bout en bout sur trois produits réels** : un connu de Grocy (ajout direct), un connu
   d'OFF et évident (`3560070825493`, Fusilli → Placard), un non alimentaire absent d'OFF (shampooing
   → Gemini, surcharge à la main). Vérifier dans Grocy : emplacement, groupe, calories, photo, les 9
   userfields, et que la description n'a pas bougé.

## Hors périmètre

- **Retrait de `grocy-scanner.html`** : lot ultérieur (§6).
- **Rattrapage des produits déjà mal classés** (les derniers créés, tous en Frigo) : ni corrigés ni
  listés par ce lot. À décider séparément — la règle de §4 est réutilisable telle quelle pour un
  passage en masse.
- **Open Beauty Facts** pour l'hygiène et les cosmétiques : Gemini couvre déjà ces cas ; à rouvrir si
  les devinettes s'avèrent mauvaises à l'usage.
- Modification de l'unité de stock, du prix, du magasin, des seuils de stock minimum.
- La liste de courses (`todo.grocy_shopping_list`) et son bouton, inchangés.
- Le fait que `grocy.allanic.me` réponde à l'API **sans clé** depuis Internet : constaté en explorant,
  hors sujet de ce lot, mais signalé — ce lot s'appuie dessus pour l'accès depuis le téléphone.
