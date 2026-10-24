# Pile de cartes des tablettes

Date : 2026-10-24. Demandée par le propriétaire, conçue avec lui (maquettes du
compagnon visuel : `cartes-vocabulaire.html` puis `cartes-milieu-libre.html`,
validée « c'est parfait »). Suit la refonte de la carte média
(`2026-10-23-carte-media-refonte-design.md`, livrée en v1.9.0).

## Pourquoi

Aujourd'hui le bloc central d'une tablette montre **un seul** mode à la fois
(`ModePrincipal`, `app/src/modes.ts`) : le premier actif de
`agencement.modes`. Ce qui ne gagne pas disparaît. Deux conséquences vécues :

- En cuisine, pendant la musique, la carte média fait tomber la rangée Ambiance
  (échelle de budget du 2026-10-24) et avec elle la tuile minuteur
  (`tuileMinuteur`). Le propriétaire : « la tuile minuteur est prioritaire ».
- Rien ne permet de voir ce qui a perdu : l'aspirateur qui tourne pendant un
  film, une impression 3D en cours pendant la musique.

Le propriétaire veut **une pile** : toutes les activités en cours sous forme de
cartes, la plus prioritaire affichée, les autres atteintes **en glissant**. Et
de nouvelles cartes, dont une pour l'imprimante 3D du bureau.

## Objectifs

1. Un emplacement de **taille fixe** pour les cartes, identique pour toutes :
   311 × 264 px, la carte média actuelle (`blocMedia`, `contrat/budget.json`).
2. Un **vocabulaire identique** sur toutes les cartes (voir « Anatomie »).
3. Toutes les cartes actives sont dans la pile, **ordonnées par priorité** ; la
   plus prioritaire est affichée ; on glisse à gauche/droite pour les autres.
4. Après **une minute** sans toucher, la tablette revient d'elle-même à la carte
   la plus prioritaire.
5. Le **minuteur passe avant tout**, sauf une recette ouverte, qui affiche
   déjà son décompte (voir « Ordre »).
6. Le premier lot couvre **toutes** les cartes de la table « Cartes » ci-dessous.

## Non-objectifs

- Pas de sonnette, caméra de porte, boîte aux lettres, lave-linge ni
  lave-vaisselle : ces équipements n'existent pas dans la maison (registre HA
  relu le 2026-10-24).
- Pas de langage de règles configurable pour décider QUAND une carte est active :
  les conditions restent en TypeScript (même frontière que `CONDITIONS`,
  `modes.ts`, spec du 2026-09-12 « Ce qu'on ne construit pas »). L'ORDRE, lui,
  reste une donnée.
- Pas de refonte des tuiles de commandes, de la synthèse ni du bandeau.

## Anti-objectifs

- **Un bouton avec du texte.** Les trois boutons du bas sont des icônes,
  jamais un libellé (« pas de bouton avec du texte »).
- **Une carte qui change de taille** selon son contenu ou son sujet.
- **Le minuteur caché** derrière une autre carte (la recette ouverte, qui
  affiche son décompte, est la seule exception).
- **Un bouton mort** (règle du projet) : un bouton n'apparaît que si son action
  existe pour l'entité configurée.
- **Un dégradé sur grande surface** (bandes sur les dalles 6 bits, raison
  écrite dans `base.css`) ; **un voile sur une image** (refusé pour la carte
  média, même règle ici).
- **Un écran qui déborde** des 585 px.
- **Une langue figée** : rien dans la pile ne suppose le français ou l'alphabet
  latin (titres d'impression, noms de pièces, noms de plantes). Mêmes règles
  que la carte média : hauteurs de ligne explicites, ellipse sur une ligne,
  `dir="auto"`.

## Anatomie d'une carte (validée sur maquette)

Fixe, partagé par toutes les cartes :

- **Cadre** : 311 × 264 px, rayon 28 px, padding de la carte média.
- **En-tête** en haut : étiquette (« ÉTAT · Pièce », majuscules, 11 px) et
  titre (15 px, deux lignes max) ; sous-titre facultatif.
- **Trois boutons ronds de 62 px** en bas, icônes seules, le central en
  couleur primaire (l'action principale).
- **Fond tiré du contexte** : une image quand le sujet en a une, sinon une
  couleur ou une texture unie qui dit l'état. Texte et boutons prennent leurs
  teintes du fond par le pipeline existant (`tones.ts`, `poster-sampler.ts`,
  `boot/media-tones.ts`), avec la même garantie : contraste au pire pixel
  ≥ 5:1 pour le texte, plaque opaque seulement où il le faut, icônes ≥ 4,5:1.

Libre, propre à chaque carte : **la zone du milieu**, entre l'en-tête et les
boutons. Pas forcément de barre de progression (« on n'est pas obligé de
reprendre la barre »). La carte média garde la sienne.

Indicateur de position : des points sous la carte (le point courant allongé),
seulement quand la pile compte plus d'une carte.

## Cartes

Entités relues dans le registre HA le 2026-10-24 (lecture seule). Elles ne sont
**jamais écrites en dur** dans `app/` : elles viennent de la configuration
(voir « Configuration »).

| Carte | Active quand | Milieu (maquette) | Boutons (gauche, centre, droite) | Fond |
|---|---|---|---|---|
| Minuteur | un minuteur de la pièce tourne ou est en pause (`timer.cuisine`, `_2`, `_3`) | décompte en très gros, heure de sonnerie, nombre d'autres minuteurs | +1 min · pause/reprise · arrêt | couleur qui se réchauffe vers la fin |
| Média | comme aujourd'hui (`media`, `cinema`) | barre, temps, volume — inchangé | inchangé | pochette (inchangé) |
| Imprimante 3D | impression en cours, en pause, terminée non retirée, ou en erreur (Bambu Lab, `bambu_lab`) | pourcentage en gros, heure de fin, couche, les 4 bobines de l'AMS (celle qui imprime plus grosse) | caméra · pause/reprise · arrêt | image de couverture de l'objet (`image.*_image_de_couverture`) |
| Aspirateur | il nettoie, revient, ou est en erreur (deux robots Valetudo) | pièces du passage : faite / en cours / à venir ; batterie, temps restant | base · pause/reprise · choisir les pièces (`vacuum-choice.ts` existant) | plan Valetudo (`camera.aspirateur_camera*`) |
| Voiture | en charge, ou à brancher (débranchée et niveau sous la limite de charge) | charge et autonomie en gros, puissance, heure de fin, limite | limite 80 % · arrêt/démarrage charge · clim | couleur selon l'état (bleu en charge, ambre à brancher) |
| Animaux | fontaine sans eau, filtre à changer, panne fontaine ou distributeur | une ligne par appareil (fontaine, croquettes, filtre) | nourrir · c'est fait · plus tard | texture unie |
| Plantes | une sonde sous son seuil | une jauge par sonde | plus tard · arrosée (valide l'habitude) · détails | couleur unie |
| Tapis de marche | une marche est en cours (KingSmith) | vitesse, pas, distance, durée | ralentir · arrêt · accélérer | couleur unie |
| Repas (cuisine) | dans l'heure qui précède le repas planifié (`home-stock`) | plat, heure, ingrédients manquants | courses · ouvrir la recette · valider le repas (`script.home_stock_validate_next_meal`) | photo si disponible, sinon couleur |
| Garde-manger (cuisine) | `binary_sensor.home_stock_expirations` ou `_shortages` à `on` (les seuils sont ceux de home-stock) | les trois premiers produits concernés | plus tard · ouvrir le garde-manger · courses | couleur unie |
| Air | PM2,5 au-dessus du seuil configuré (purificateur `xiaomi_miio`) | valeur, vitesse du moteur | plus tard · marche/arrêt · mode favori | couleur selon le niveau |
| Alarme | au moins une zone armée (Alarmo) | zones armées | — · désarmer (code demandé par Alarmo si configuré) · — | couleur unie |
| Encre | une cartouche sous le seuil configuré (imprimante Canon, `ipp`) | niveaux par couleur | — · plus tard · — | couleur unie |
| À faire (aération) | la condition actuelle du mode `aeration` (ouvrant ouvert > 10 min avec chauffage ou pluie) | quel ouvrant, depuis quand | — · plus tard · — | couleur neutre, jamais le rouge d'erreur |

Les modes actuels deviennent des cartes : `minuteur` → Minuteur, `menage` →
Aspirateur, `media`/`cinema` → Média, `voiture` → Voiture, `aeration` → une
carte « À faire » (ouvrant ouvert + chauffage ou pluie), `recette` → la recette
réduite. `alerte` reste **hors pile** : elle prend l'écran comme aujourd'hui
(décision du constructeur, voir « Laissé au constructeur »).

## Ordre

Validé par le propriétaire (« tout est bon ») :

0. **Recette ouverte** (réduite) — devant le minuteur, comme aujourd'hui :
   elle affiche déjà le décompte du minuteur le plus urgent (réponse du
   propriétaire du 2026-10-24, « recette d'abord »).
1. **Minuteur** — devant tout le reste.
2. **Ce qui attend un geste** : impression terminée ou en erreur, filament
   manquant, aspirateur coincé, croquettes en panne, fontaine vide, voiture à
   brancher, aération.
3. **Musique ou film.**
4. **Ce qui tourne tout seul** : impression en cours, aspirateur qui passe,
   charge de la voiture, tapis de marche.
5. **Rappels doux** : plante assoiffée, produits qui périment, prochain repas,
   air, encre, alarme.

Ces rangs **remplacent** `agencement.modes` comme source de l'ordre entre
familles. À l'intérieur d'un rang, l'ordre est celui de `agencement.modes`
(qui reste éditable dans le formulaire HA, le schéma et l'export YAML) ; une
carte dont le type n'y figure pas se range en fin de son rang. `alerte` reste
hors pile et prend tout l'écran, minuteur compris, comme aujourd'hui.

## Où apparaît chaque carte

Validé par le propriétaire :

- **Les cartes de sa pièce** : au bureau l'imprimante 3D, le tapis, la plante
  du bureau ; en cuisine les minuteurs, le repas, le garde-manger ; etc.
- **Les alertes de toute la maison**, sur toutes les tablettes : aspirateur
  coincé, animaux, voiture à brancher.
- **La musique d'ailleurs**, comme aujourd'hui (sous-entrée maison).

## Glissement

- Glisser horizontalement sur la carte passe à la suivante / précédente. Les
  tablettes ont `webviewDragging` activé dans Fully (sans lui, aucun
  `pointermove` n'atteint la page) ; le seuil qui sépare un appui d'un
  glissement est celui de `geste.ts`.
- Un appui sur un bouton reste immédiat (règle de `interaction.ts`) ; un
  glissement qui commence sur un bouton ne le déclenche pas.
- Une minute sans toucher : retour à la carte la plus prioritaire.
- Quand une carte apparaît plus prioritaire que celle affichée, elle prend la
  place immédiatement — c'est ce qui garantit « le minuteur d'abord ».

## Budget

Réponse du propriétaire (2026-10-24) : **pile vide, le petit bloc revient.**

- Pile non vide : une carte de 264 px. L'échelle de budget (`arrangement()`,
  `screen-budget.ts`, jumeau `budget.py`) s'applique à **toute** carte et plus
  seulement à `modesABlocMedia` : son déclencheur devient « la pile n'est pas
  vide », pas un mode. Le minuteur (215 px aujourd'hui, 0 commande) passe à
  264 px et rejoint le régime commun.
- Pile vide : le bloc par défaut de l'écran (`blocDefaut` : agenda, repas ou
  voiture), avec son budget actuel (84 px, 153 px pour la voiture) et ses
  commandes. Ce bloc n'est **pas** une carte et ne compte pas dans la pile.
- La hauteur de l'écran change donc quand la pile se remplit ou se vide ; elle
  ne change jamais d'une carte à l'autre.
- Le corpus `contrat/cas-budget.json` reste partagé par les deux suites.

**La grille de commandes suit la carte la plus prioritaire, pas la carte
affichée** : glisser ne réordonne jamais les commandes sous le doigt. Les
promotions actuelles (`ordreCommandes` : Ambilight et Lumières en cinéma, etc.)
sont clés par le type de cette carte.

## Configuration

Les entités de chaque carte viennent de Home Assistant, pas du code :
la sous-entrée **maison** (`maison.py`) porte déjà des sources rattachées à une
`piece` ; elle s'étend aux appareils des cartes (imprimante, aspirateurs,
voiture, animaux, plantes, tapis, air, alarme, encre), chacun avec sa pièce, ou
« toute la maison » pour les alertes. Le contrat (`contrat/maison.schema.json`)
et son corpus suivent ; l'export/import YAML (`yaml_ecrans.py`) transporte le
tout. Un appareil absent de la configuration = carte jamais active, jamais une
erreur.

## Contraintes

- Fire 7, WebView Chromium 119, cadre 343 × 585.
- Aucun fichier source au-delà de 500 lignes.
- Les portes d'écriture HA restent dans `garde_ecran.py` ; les formulaires dans
  `formulaire.py` (invariants du `CLAUDE.md`).
- Code en anglais ; interface française aujourd'hui, mais aucune chaîne de
  l'interface ne doit supposer une langue au point de casser une autre.

## Laissé au constructeur

- Le découpage en modules (une carte = un fichier de rendu est attendu).
- L'animation du glissement (courte, sans dégradé).
- Les icônes exactes, dans la bibliothèque existante (`rendu/icones.ts`).
- `alerte` hors pile (elle confisque l'écran comme aujourd'hui).
- Les seuils des rappels doux (plantes : `soil_warning` de la sonde quand il
  existe ; PM2,5 ; encre).

## Décisions prises après la relecture d'un constructeur

Réponses du propriétaire (2026-10-24) : pile vide → le petit bloc revient ;
recette avant minuteur. Le reste est **la décision du concepteur** (Claude),
à vérifier à la lecture :

- **Boutons manquants** : moins de trois actions réelles → les boutons
  présents restent à leur place (gauche, centre, droite), les places vides
  restent vides. Jamais un bouton factice pour remplir la rangée.
- **« Plus tard »** masque la carte sur **toutes** les tablettes pendant 2 h ;
  l'état vit dans l'intégration `home_desk` (une commande websocket, écrite
  par `garde_ecran.py`), jamais dans le navigateur d'une seule tablette.
  **« C'est fait » / « arrosée »** appellent l'action HA réelle quand elle
  existe (habitude des plantes : `input_boolean.habitude_plantes_fait`), sinon
  valent « plus tard ».
- **Prise de place** : une carte prend la place de celle affichée seulement à
  son **apparition** (passage de inactive à active) et si elle est plus
  prioritaire. Une carte déjà là ne revient pas toute seule tant que la
  minute de retour n'est pas écoulée.
- **Configuration** : la sous-entrée maison gagne une liste `appareils`, chacun
  `{type, piece | "maison", entites}` ; `type` parmi les cartes de ce
  document. Les minuteurs, la recette, le repas et le garde-manger restent sur
  l'écran (ils y sont déjà). Une carte d'alerte (« attend un geste ») est
  montrée partout quand son appareil est en `"maison"`, sinon dans sa pièce.
  Le schéma change de version, avec une migration dans `migration.py`.
- **Voiture « à brancher »** : débranchée et niveau sous la limite de charge
  configurée. Un écran dont `blocDefaut` vaut `voiture` garde son bloc voiture
  quand la pile est vide.
- **Livraison par lots** dans un même plan : d'abord la pile, le glissement,
  le budget et les cartes issues des modes actuels (minuteur, recette, média,
  aspirateur, voiture, aération) ; ensuite l'imprimante 3D ; ensuite les autres.
  Toutes font partie de ce document.
- **Glissement : chercher avant de construire.** Le constructeur compare une
  bibliothèque de carrousel maintenue et légère (Embla Carousel est la
  première candidate) avec une extension de `geste.ts`, sur Chromium 119 et
  avec la règle « un appui agit tout de suite », et écrit en une ligne ce
  qu'il a retenu et pourquoi.
