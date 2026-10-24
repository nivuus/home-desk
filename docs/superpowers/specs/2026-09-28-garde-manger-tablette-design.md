# Écran « Garde-manger » sur la tablette de la cuisine

*Spec de conception — 2026-09-28*

## Le besoin

> « Il faudrait un écran pour marquer un produit comme consommé (partiellement
> ou non), plutôt que ça soit directement dans la liste des tâches. »

Constat du 2026-09-28, pendant l'étape 6 de la mise en production 3c : la vue
« Tâches » de la cuisine rassemble toutes les listes `todo.*` de la synthèse,
donc `todo.home_stock_expirations` (21 lots ce jour-là) y côtoie l'entretien et
les courses. Cocher une de ces lignes **vide le lot** (`consume_batch` sans
quantité) : ni consommation partielle, ni motif, et les trois tâches
d'entretien sont noyées dans une vue de six lignes.

## Les arbitrages du propriétaire (2026-09-28)

| Question | Choix |
|---|---|
| Périmètre | **Tout le stock**, les lots proches de leur date limite en tête |
| Retrouver un produit | **Emplacement, puis rayon** |
| « Partiellement » | **Fractions (Tout, ½, ¼) + sélecteur − / +** |
| Motif | **« Mangé » par défaut**, « Jeté » et « Périmé » en secondaire |
| Partage en parts | **Non** — tout « mangé » compte pour le propriétaire |
| Accès | La tuile **« Garde-manger » remplace « Courses »** sur l'accueil de la cuisine ; les courses restent dans la vue Tâches |
| Approche | La tablette lit les lots **à la demande** et consomme **par lot** |

Approches écartées : publier le stock dans des attributs d'entité (165 lots
dépassent la taille d'attributs raisonnable de HA, et l'entité serait réécrite
à chaque mouvement) ; réutiliser l'écran « Manger » du panneau HA de
home-stock (conçu pour un ordinateur, hors du budget de 585 px et des règles
tactiles de l'app).

## Ce qui existe déjà

- `home_stock/batches/list` → `{"batches": [...]}`, une ligne par lot ouvert
  (`storage/repositories.py::stock_rows`) : `id`, `remaining`, `best_before`,
  `entered_at`, `opened_at`, `product_id`, `product_name`, `base_unit`,
  `article_label`, `location_id`, `location_name`… **mais ni le rayon, ni la
  position de l'emplacement.**
- `home_stock/stock/consume` : `product_id`, `quantity`, `reason`
  (`consumption`/`discard`/`expired`), `batch_id` facultatif,
  `idempotency_key` facultative. Le motif `consumption` est le seul qui nourrit
  le journal personnel.
- Aucune commande `home_stock/*` n'exige un administrateur (vérifié le
  2026-09-28) ; l'utilisateur `Tablet` est un utilisateur standard.
- Données mesurées le 2026-09-28 : 165 lots ouverts, 131 produits, 16 rayons,
  4 emplacements (Frigo, Congélateur, Placard, Autre), 6 produits en stock sans
  rayon.
- Côté app : `Connexion.envoyerCommande` (réponse par `id`, délai, refus
  `RefusHA` avec le `code` et le message de home-stock), l'armement à deux
  appuis (`cochage.ts::createArming`), le verdict hors ligne
  (`estHorsLigne`), le motif « +N » de la vue Tâches, le budget de 585 px.
- Contrat d'écran : `vue` accepte déjà toute valeur `^#` (`contrat/ecran.schema.json`) ;
  `horsTaches` existe déjà sur une ligne de synthèse.

## Conception

### 1. Navigation (trois niveaux)

Toutes les vues respectent les règles de l'app : lignes de 64 px, au plus six
lignes par page, aucun défilement, bouton Retour, retour automatique à
l'accueil.

1. **Entrée.** En tête, **« À consommer vite (N) »** : les lots dont l'`uid`
   figure dans `todo.home_stock_expirations` (l'`uid` de cette liste est
   l'identifiant du lot). Le seuil reste donc défini à un seul endroit,
   home-stock. En dessous, quatre tuiles d'emplacement avec leur nombre de
   lots, dans l'ordre `location.position` ; un emplacement vide est grisé.
2. **Rayons d'un emplacement.** Tuiles de rayon avec leur nombre de lots, dans
   l'ordre `aisle.position`, seuls les rayons non vides ; « Sans rayon » en
   dernier. **Un emplacement qui n'a qu'un rayon passe directement au niveau
   3.**
3. **Lots.** Une ligne par lot, triée par `best_before` croissant (sans date en
   dernier) : nom du produit, quantité restante dans son unité (« 350 g »,
   « 3 pièces »), date limite en rouge si dépassée, en orange si le lot est
   dans la liste « À consommer ». Au-delà de six lots, la sixième ligne devient
   **« Suite › (N) »** et ouvre la page suivante. « À consommer vite » ouvre ce
   niveau directement, tous emplacements confondus.

### 2. La fiche de consommation

En tête : produit, quantité restante, date limite, emplacement et rayon.

- **Quantité** : raccourcis **Tout** (par défaut), **½**, **¼** du reste ; un
  sélecteur **− / +** dont le pas vaut 1 pour les pièces, 50 g / 50 ml sinon,
  10 quand il reste moins de 200. La quantité reste dans [pas, reste] (le reste
  lui-même s'il est inférieur au pas). Les fractions de pièce sont permises. La
  fiche dit en direct « Sortir 175 g · il restera 175 g ».
- **Motif** : bouton principal **« Mangé »** (`consumption`), secondaires
  **« Jeté »** (`discard`) et **« Périmé »** (`expired`).
- **Confirmation à deux appuis** (`createArming`, 3 s) : le premier appui arme
  le bouton (« Toucher pour confirmer »), le second envoie ; armer un bouton
  désarme les autres. Hors ligne, les trois boutons sont inactifs.
- **Envoi** : `home_stock/stock/consume` avec `product_id`, `batch_id`,
  `quantity`, `reason` et une `idempotency_key` tirée à l'armement.
- **Réussite** : retour à la liste des lots, **relue** depuis home-stock ; un
  bandeau bref « Mangé : 175 g de Yaourt nature ».
- **Refus** (`RefusHA`) : la fiche reste ouverte avec le message de home-stock ;
  **rien n'est retiré de l'écran avant la confirmation** (pas d'effacement
  optimiste : le geste est irréversible).
- **Silence** : après le délai de `envoyerCommande`, « home-stock ne répond
  pas — rien n'a été retiré » ; réessayer réutilise la même clé
  d'idempotence, donc ne décompte jamais deux fois.

Hors périmètre : marquer « entamé » (`open_batch`), le partage en parts.

### 3. Données, configuration et pannes

**home-stock** (rétrocompatible) :
- `stock_rows` ajoute `aisle_id`, `aisle_name`, `aisle_position` (jointure
  externe : `NULL` pour un produit sans rayon) et `location_position`.
- Vérifier que `stock/consume` rafraîchit le coordinateur ; le faire sinon.
- **Correctif inclus** : `meal/plan`, `meal/move` et `meal/cancel` appellent
  `coordinator.async_request_refresh()` comme `meal/validate` — mesuré le
  2026-09-28, annuler un repas laissait `sensor.home_stock_next_meal` périmé
  jusqu'à 15 minutes.

**home-desk, app** :
- Chargement à l'ouverture de la vue : `home_stock/batches/list` et la liste
  `todo.home_stock_expirations` ; relecture après chaque consommation réussie
  et à chaque réouverture ; aucune lecture périodique.
- home-stock plus ancien, sans `aisle_*` : le niveau des rayons est sauté.
- Lecture en échec ou home-stock absent : **« Garde-manger indisponible »** et
  un bouton Réessayer ; stock vide : **« Rien en stock »**. Jamais un écran
  vide sans explication.

**Contrat et configuration** :
- `vue: '#garde-manger'` : le schéma l'accepte déjà (`^#`) ; l'ajouter partout
  où une liste fermée de vues existe (routeur de l'app, formulaire du
  composant, validation Python si elle en ferme une).
- Configuration réelle de la cuisine (sous-entrée HA) : la tuile « Courses »
  devient « Garde-manger » (`vue: '#garde-manger'`, même emplacement de
  grille), et la ligne de synthèse « À consommer » reçoit `horsTaches: true`.
  Les écrans de référence et leurs épreuves de fidélité suivent.

### 4. Tests

Règles du dépôt : décors à deux sujets, chaque test prouvé capable d'échouer.

- **home-stock** : `batches/list` porte rayon et positions (décor avec et sans
  rayon), appelé par un utilisateur **non administrateur** ; `meal/cancel`,
  `meal/plan`, `meal/move` mettent à jour le capteur du prochain repas sans
  attendre l'intervalle.
- **home-desk, logique pure** : regroupement et tri, « Sans rayon » en dernier,
  saut du niveau rayon (un seul rayon, ou rayons absents), pagination,
  fractions/pas/bornes pour g, ml et pièces, croisement avec la liste
  « À consommer ».
- **home-desk, geste** : un appui arme sans envoyer ; le second envoie la bonne
  commande (lot, quantité, motif, clé) ; relecture après réussite ; refus =
  fiche ouverte, message affiché, rien retiré ; silence = avertissement ; hors
  ligne = rien ne part.
- **Contrat** : `#garde-manger` accepté de bout en bout ; épreuves de fidélité
  et écrans de référence verts.
- **Rendu** : chaque vue tient dans 585 px, vérifié par le calcul ; la page de
  rendu headless de la cuisine est mise à jour.

## Livraison

Un agent implémente et ouvre les PR (**home-stock d'abord**, puis home-desk)
jusqu'à des releases vertes. **La mise en production n'est pas faite par
l'agent** : elle est menée avec le propriétaire, étape par étape (règle du
plan 3c) — poser home-stock, poser home-desk, redémarrer HA, modifier la
configuration de la cuisine, vérifier sur la tablette.
