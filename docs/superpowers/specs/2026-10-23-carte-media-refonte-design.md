# Carte média des tablettes — refonte

Date : 2026-10-23. Demandée par le propriétaire, conçue avec lui (maquettes du
compagnon visuel, `.superpowers/brainstorm/`, piste « C »).

## Pourquoi

Sur les trois tablettes, la carte média (`app/src/rendu/media.ts`) est la seule
façon de piloter la musique ou un film sans sortir le téléphone. Trois plaintes,
dans les mots du propriétaire : « on ne voit pas assez les contrôles », « pour
modifier le volume c'est galère », « on voit à peine la progression ». Relevé
dans le code de `origin/main` (57013d6), chacune a une cause précise :

| Plainte | Cause (`app/src/styles/base.css`) |
|---|---|
| Contrôles peu visibles | `.media-bouton` : fond `rgba(0,0,0,.18)` sur `--md-primary-container` |
| Volume pénible | `.media-rail` : un trait de 6 px **sans piste de fond** (on ne voit pas où il finit), réglé par un seul `pointerdown`, pas de glissement |
| Progression invisible | `.media::after` : 4 px de `--md-tertiary` (`#403600` en clair) sur `#00788d`, sans piste, collés au bord, sans temps affichés |

Deuxième demande, venue pendant la conception : **couvrir plus de lecteurs**.
Aujourd'hui chaque tablette ne suit que sa pièce et le groupe « Maison ».

## Objectifs

1. Des commandes qu'on voit et qu'on touche sans viser : tout se fait par appuis
   sur des cibles de 62 px, aucun geste fin.
2. Une progression lisible de loin : barre épaisse, piste visible, temps écoulé
   et temps restant.
3. La pochette (ou l'affiche du film) en fond, **nette**, et des commandes dont
   la couleur s'adapte à elle tout en restant lisibles.
4. Une tablette montre d'abord ce qui joue dans sa pièce, et sinon ce qui joue
   ailleurs dans la maison, en le nommant, pilotable à distance.

## Non-objectifs

- Pas de nouvelle source de métadonnées : on affiche ce que Home Assistant
  publie (`media_title`, `media_artist`, `entity_picture`…), rien de plus.
- Pas de file d'attente, de navigation dans la bibliothèque, ni de choix de
  playlist sur la tablette.
- Pas de changement de l'ordre des modes : `menage` et `cinema` passent toujours
  devant `media` (`agencement.modes` de chaque écran).

## Anti-objectifs (ce qui ferait échouer la refonte même si elle « marche »)

- **Un voile clair sur la pochette.** Refusé explicitement (« pas de voile
  blanc sur la pochette »). Un voile sombre uniforme et des pastilles grises
  sous chaque élément ont aussi été montrés et refusés (« aucun des deux »).
- **Un texte illisible sur une pochette chargée.** Le propriétaire l'a relevé
  sur la maquette « rayures » : c'est le cas qui justifie le fond de texte
  conditionnel ci-dessous.
- **Un bouton mort** (règle du projet) : aucun bouton affiché que le lecteur ne
  sait pas exécuter, aucune valeur de volume inventée.
- **Un dégradé sur grande surface** : il fait des bandes sur les dalles 6 bits
  des Fire 7 (raison déjà écrite dans `base.css`). Fonds et pastilles sont unis.
- **Un écran qui déborde** des 585 px.

## Contraintes

- Fire 7, WebView Chromium 119 (Fully Kiosk), cadre de 343 × 585 px, budget de
  hauteur calculé par `combien()` (`app/src/modes.ts`) à partir des hauteurs
  mesurées de `contrat/budget.json`.
- L'affiche passe **toujours** par `/api/vignette` (400 px, `vignetter()` dans
  `app/src/media.ts`) : une affiche Plex de 2000 × 3000 tue la WebView. Toute
  lecture de pixels se fait sur cette vignette, jamais sur l'original.
- Contraste texte ≥ 5:1 (seuil du projet, contrôlé par
  `app/outils/verifier-rendu.mjs`).
- Pas d'`entity_id` en dur hors de la configuration d'écran (règle de
  `CLAUDE.md`).

## Ce qui a été décidé

### Disposition (piste C)

De haut en bas, dans la carte :

1. Étiquette `EN COURS · <pièce>`, titre (deux lignes maximum, comme
   aujourd'hui), sous-titre (artiste ou série).
2. Barre de progression de 8 px avec sa piste visible, et en dessous le temps
   écoulé à gauche, le temps restant (`−1:47`) à droite. Les temps avancent
   côté navigateur avec le mécanisme existant (`progression.ts`).
3. Rangée de transport : précédent, pause/lecture, suivant, répartis sur toute
   la largeur. Pause/lecture est le bouton principal (disque plein), les deux
   autres sont secondaires. Les règles `CAP.*` actuelles décident quels boutons
   existent.
4. Rangée de volume : `−` à gauche, `+` à droite (62 px chacun), au centre le
   niveau écrit en gros (`68 %`) au-dessus d'une jauge fine.

Sans progression connue (TV en direct, radio), la ligne 2 n'est pas rendue ;
sans transport, la ligne 3 non plus. La carte rétrécit, elle ne montre jamais
de case vide.

### Volume

- `+`/`−` appellent `volume_set` avec ±5 % quand le lecteur publie
  `volume_level` (bit `VOLUME_SET`). **Mon choix**, pas celui du propriétaire :
  5 % par appui, et l'appui maintenu répète.
- Lecteur « par pas » (`VOLUME_STEP` sans niveau connu) : `+`/`−` appellent
  `volume_up`/`volume_down`, et **aucun niveau n'est affiché** (règle existante
  de `rendu/media.ts` : jamais une jauge à une valeur inventée).
- Retour optimiste conservé : le niveau affiché change au toucher, avant la
  réponse de Home Assistant.

### Couleurs : la pochette décide

- **Avec pochette** : elle couvre toute la carte, sans voile ni opacité réduite.
  La tablette extrait sa couleur dominante avec
  `@material/material-color-utilities` (déjà dépendance du projet, version
  0.4.0) : `QuantizerCelebi` puis `Score`, puis une `TonalPalette` de cette
  teinte (chroma relevée à 36 au minimum pour les pochettes ternes).
- **Boutons** : disques **pleins** pris dans la palette, donc le contraste de
  l'icône ne dépend jamais de la pochette. Pochette claire (texte foncé) :
  bouton principal ton 30 avec icône ton 98, boutons secondaires ton 90 avec
  icône ton 10. Pochette sombre : ton 90 / ton 10 pour le principal, ton 25 /
  ton 95 pour les secondaires. Barres et jauges : piste au ton secondaire,
  remplissage au ton principal.
- **Texte** : la tablette mesure la luminance de chaque pixel de la vignette
  sous la zone du texte (étiquette, titre, sous-titre, temps, niveau de volume)
  et choisit, parmi les tons extrêmes de la palette, celui qui a le meilleur
  contraste **au pire pixel**.
- **Fond de texte conditionnel** : si ce pire contraste reste sous le seuil du
  projet (5:1 ; la maquette montrée au propriétaire testait 4,5:1), le
  texte reçoit un fond **uni, teinté par la palette** (ton 92 sous un texte
  foncé, ton 15 sous un texte clair), arrondi, ajusté au texte. Les cartes dont
  le texte passe sans aide n'en ont pas. Validé par le propriétaire sur la
  maquette (rayures : 3,6:1 sans fond, 17,2:1 avec).
- **Sans pochette** (YouTube, TV sans métadonnées) : la carte garde les
  couleurs du thème (`--md-primary-container`), avec la même disposition et
  des boutons à disque plein.
- Le calcul se fait **une fois par URL d'affiche** et se met en cache ; il
  travaille sur une version réduite de la vignette (64 × 64 suffit à la
  quantification). Si les pixels ne sont pas lisibles (affiche externe,
  `http…`, que `vignetter()` laisse passer telle quelle : canvas « tainted »),
  la carte prend le rendu « sans pochette » plutôt que de deviner.

### Amendement du 2026-10-28 : pochette floutée, plus de fond de texte

Le propriétaire n'aime pas le fond posé sous chaque élément (« je suis pas fan
du fond sur chaque élément ») ; il garde la disposition et choisit la pochette
floutée. Ce qui remplace le **fond de texte conditionnel** ci-dessus :

- La pochette est **floutée** (écart type de 24 px, `app/src/poster-filter.ts`),
  le calque déborde de la carte de trois écarts types pour que le flou ne fonde
  pas les bords vers la couleur du thème. Le flou écarte les arêtes de la
  pochette, qui faisaient chuter le contraste au pire pixel : les rayures
  passent seules (6,7:1 au lieu de 3,7:1).
- Le flou ne suffit pas sur une pochette de luminance moyenne : une luminance
  uniforme vers 0,18 plafonne toute couleur de texte à 4,6:1. Dans ce cas, et
  seulement dans ce cas, le texte passe au ton clair et la pochette est
  **assombrie du minimum** qui le porte à 5:1 (`brightness()`, cherché par
  dichotomie sur les pixels réels, arrondi 8 bits pris du côté clair). Jamais
  éclaircie : le voile clair reste refusé.
- **Plus aucun fond derrière un texte.** Le contrôle de rendu en fait une
  faute (« text on a plate »), avec ses contre-épreuves : pochette moyenne sans
  son assombrissement, rayures non floutées, fond remis sous le titre.
- Risque assumé à vérifier sur la tablette : un flou est une surface en
  dégradé, que les dalles 6 bits des Fire 7 peuvent rendre en bandes (raison de
  l'anti-objectif « dégradé sur grande surface »). Le choix est celui du
  propriétaire ; si les bandes se voient, c'est ici qu'on le notera.

### Place à l'écran

La carte C mesure environ 260 px contre 153 px (`hauteurs.blocHaut`), soit
environ 107 px de plus. Mesuré avec `combien()` en mode `media` : le salon (pas
de rangée « Ambiance ») a déjà ~97 px de reste ; le bureau et la cuisine n'en
ont que 8.

Décision du propriétaire, dans cet ordre :

1. **La synthèse du bas est réduite** en mode média.
2. **Si ça ne suffit pas, la rangée « Ambiance » disparaît** pendant que la
   carte média est affichée (bureau et cuisine). Les commandes restent.

C'est le **budget** qui décide (via `combien()`), pas une liste de pièces :
un écran qui a la place garde sa rangée « Ambiance ». Cela renverse une
décision écrite dans `modes.ts` (« la place vient de la 3e/4e commande, jamais
de la rangée Ambiance ») : le commentaire doit être corrigé avec la date et la
raison.

### Ce qui est suivi

- Chaque tablette suit d'abord **ses** sources (`sources` de l'écran), dans
  l'ordre déclaré.
- Si aucune ne joue, elle suit ce qui joue **ailleurs** : une liste de sources
  commune à la maison, chacune avec le nom de sa pièce, affiché dans
  l'étiquette (`EN COURS · Chambre`). Pause et volume agissent à distance.
- Sources ajoutées à cette liste : musique de la chambre et de la salle de
  bain, téléviseur de la chambre, téléviseur de la salle TV (avec son lecteur
  Plex), projecteur Nebula. **Ma supposition, non confirmée** : les lecteurs
  Plex des téléphones restent dehors, ce ne sont pas des lecteurs de la maison.
- **Une source d'une autre pièce fait passer la tablette en mode `media`**
  (décision du propriétaire) : musique dans la chambre, rien au salon → la
  tablette du salon affiche la grande carte, avec les mêmes conséquences de
  place (synthèse réduite, rangée « Ambiance » retirée là où le budget
  l'exige). `CONDITIONS.media` (`modes.ts`) et le calcul de `sourceJoue`
  (`app/src/boot/frame.ts`) l'intègrent.
- **Mon choix** : une source distante ne déclenche le mode que si elle est
  `playing` ou `buffering`, **pas `paused`**. `ETATS_ACTIFS` compte `paused`
  pour les sources de la pièce, et c'est juste là ; appliqué aux sources
  distantes, un lecteur oublié en pause dans la chambre tiendrait les trois
  tablettes en mode musique indéfiniment. Si on met en pause *depuis* une
  tablette, la carte reste affichée sur cette tablette tant que la source
  est en pause (sinon le bouton lecture disparaîtrait sous le doigt).
- **Mon choix** : une télé distante simplement allumée (`allumee`) ne
  déclenche **jamais** `cinema` dans une autre pièce : ce mode force la
  palette sombre et réordonne les commandes pour la pièce où l'on regarde.
- **Mon choix** : chaque source porte le nom de sa pièce (champ `piece`,
  aussi sur les `sources` propres d'un écran — le bureau suit
  `musique_salon` et affiche donc `EN COURS · Salon`). Une entité déjà
  présente dans les sources d'un écran est retirée de « ailleurs » pour cet
  écran. Entre plusieurs sources distantes qui jouent, l'ordre déclaré de la
  liste commune départage. Une source distante a exactement la même carte et
  les mêmes boutons qu'une source locale.
- **Mon choix** : le constructeur relève lui-même, dans Home Assistant, la
  répartition des champs (`titre`, `affiche`, `progression`, `transport`,
  `volume`, `allumee`) de chaque nouvel appareil, comme cela a été fait pour
  la télé du salon (`media.ts`, en-tête), et saisit la liste en production :
  sans elle, la refonte ne se vérifie pas sur les tablettes.
- **Mon choix technique** : une liste commune unique, déclarée une fois dans
  la configuration de l'intégration, plutôt que recopiée dans chaque écran. Elle
  s'édite depuis Home Assistant comme le reste de la configuration d'écran
  (spec du 2026-09-12) ; le contrat (`contrat/`) gagne ce champ, `make contrat`
  régénère la copie embarquée.

## Contexte Music Assistant (réglé le 2026-10-23)

Le groupe « Musique Maison » de MA ne synchronisait rien (les lecteurs HA Cast
n'ont pas la fonction `GROUPING`) ; il est remplacé par un groupe Cast natif
« Maison », lu par le fournisseur Chromecast de MA. Le fournisseur « Home
Assistant MediaPlayers » est désactivé. Les cinq entités gardent leurs noms
historiques (`media_player.musique_salon`, `_cuisine`, `_chambre`,
`_salle_de_bain`, `_maison`), réattribués aux lecteurs Chromecast de MA : rien
ne change pour les tablettes.

## Laissé au constructeur

- Les hauteurs exactes (padding, gouttières internes) tant que la carte tient
  dans le budget mesuré par `app/outils/mesurer-hauteurs.mjs`, et la mise à
  jour de `contrat/budget.json` qui en découle.
- La forme de la synthèse « réduite » (une ligne au lieu de deux, ou masquée),
  tant qu'elle libère ce que le budget exige.
- Le découpage des fichiers : `rendu/media.ts` (132 lignes) et `media.ts`
  (215 lignes) peuvent accueillir la disposition ; l'extraction de couleur et
  la mesure de contraste ont leur propre module, testable sans DOM.
- L'animation des changements (la clé `bloc:media` du moteur de mouvement reste
  la même).
- L'étendue des contrôles de `verifier-rendu.mjs` : il échantillonne déjà les
  pixels peints sous le texte sur trois affiches ; il doit maintenant le faire
  sur la carte sans voile, et garder sa contre-épreuve (`--auto-test`).
