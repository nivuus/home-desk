# Vérification image par image des transitions — conception

**Date** : 2026-08-26
**Périmètre** : `tools/wallpanel-app` — `outils/verifier-rendu.mjs` (ajout d'un banc et de quatre
détecteurs). Aucune modification de `src/` n'est prévue par cette spec : les corrections des
défauts que le banc révélera feront l'objet d'un second temps, une fois qu'on saura lesquels
existent.
**Origine** : « Teste les animations/transitions de tablette, vérifie qu'il n'y a pas de trou dans
les transitions (élément qui disparaît instantanément, élément qui chevauche un autre élément sans
fond, etc.). Vérifie image par image. »

## 1. Le trou de couverture actuel

Le moteur de mouvement (`src/mouvement/`) est vérifié sous quatre angles aujourd'hui, et les
quatre regardent un **instant figé** :

| Contrôle existant | Ce qu'il mesure | Quand |
|---|---|---|
| `verifierMarquesMouvement` (tâche 8) | tout élément qui entre ou sort porte-t-il `data-mvt` ? | deux états, au repos |
| `autoTestMouvement` C1 | modèle de boîte des fantômes | à la création du clone |
| `autoTestMouvement` C2 | typographie héritée du fantôme de chiffre | à la création du clone |
| `autoTestMouvement` C3 | cascade CSS de `.commande` (`color 0s .3s`) | déclaration, sans jouer |
| `mesurerImagesParSeconde` | cadence | pendant le vol, mais en agrégat |

`attendreAnimationsFinies()` est même appelée avant chaque mesure de rendu : le vérificateur
**attend explicitement que le mouvement soit terminé** pour regarder l'écran. Personne, à ce jour,
ne regarde une image intermédiaire.

C'est pourtant là que vivent les défauts décrits par le propriétaire. Trois exemples que le code
actuel rend possibles, tous invisibles aux cinq contrôles ci-dessus :

- **`.ligne-tache` ne déclare aucun fond** (`base.css:555` ne lui pose que `position: relative` et
  un `::after` d'accusé de réception). Le fantôme d'une ligne cochée est donc un texte transparent
  qui fond pendant 120 ms **par-dessus** les lignes remontées par la mise en page déjà refermée.
  Deux textes superposés, sur l'interaction la plus fréquente de ces écrans.
- **Le fondu croisé de `croiserBloc`** fait sortir le fantôme en `EFFET_SORTIE` (accéléré) pendant
  que le nœud réel entre en `EFFET`. Rien ne garantit que la somme des deux opacités reste au-dessus
  de 1 : si elle descend, la surface transparaît au milieu du bloc central.
- **`masquerBloc`** tient `.media` à `opacity: 0` jusqu'à 800 ms en attendant le décodage d'une
  affiche. Le comportement est délibéré et documenté ; sa durée réellement peinte, elle, n'a jamais
  été mesurée.

## 2. Décisions du propriétaire

1. **Garde-fou permanent**, pas audit ponctuel : le contrôle vit dans `verifier-rendu.mjs` et
   rougit à chaque exécution.
2. **Périmètre : les sept verdicts du moteur, en fixtures** au format exact de la dalle. Le
   balayage des vraies pages tous modes est écarté (coût d'exécution, transitions difficiles à
   provoquer proprement) ; l'angle mort que cela laisse est nommé au § 8.
3. **Quatre familles de défaut** condamnées : ruptures d'opacité, chevauchements sans fond, vides
   transitoires, ruptures géométriques.
4. **Capture par horloge virtuelle**, pas par screencast : un garde-fou qui rougit une fois sur
   trois est un garde-fou qu'on finit par désarmer.

## 3. Le banc : une horloge, trois timelines

Trois timelines portent le mouvement de ce moteur. Les faire avancer séparément ne mesurerait
qu'un tiers de son comportement.

| Timeline | Qui la porte | Comment le banc l'avance |
|---|---|---|
| Animations WAAPI | `el.animate()` du moteur, et les `transition` de `base.css` | `a.pause()`, puis `a.currentTime = t − naissance` |
| Minuteurs différés | `minuteurFn` (gardes de fantôme, annulation de masque) | file d'échéances vidée dès que `t` les dépasse |
| Décodage d'affiche | `decoder` | promesse résolue à un `t` choisi par le scénario |

Les deux dernières sont **déjà des points d'injection déclarés par `OptionsMoteur`**
(`src/mouvement/moteur.ts`) : le banc s'y branche, il n'ajoute rien à `src/`.

**La boucle.** `__peindre(étatB)` est appelé, puis — dans la **même tâche JS**, donc avant toute
peinture — tout ce que `document.getAnimations()` rend est mis en pause. Sans cette contrainte,
l'image 0 est déjà perdue et la transition entière ressemble à une apparition. `t` avance ensuite
par pas de 16,7 ms jusqu'à `max(durées) + GARDE_MS`. À chaque pas :

1. re-balayage de `getAnimations()` — une animation **née plus tard** (le croisement différé après
   décodage) est notée dans une `WeakMap` avec sa naissance et repart à `currentTime = 0` ;
2. vidage de la file de minuteurs échus ;
3. relevé structurel (§ 4) ;
4. capture de pixels **si et seulement si** le relevé désigne une zone suspecte.

**Un relevé de référence est pris AVANT la peinture.** C'est lui, et non l'image 0, qui sert de
point de comparaison au premier pas.

**Où ça vit** : un bloc de `outils/verifier-rendu.mjs`, voisin d'`autoTestMouvement` dont il reprend
l'outillage (`bundlerMoteur`, `bundlerApplication` pour la vraie feuille de style, contexte
Chromium à 343 × 585). Drapeau `--film` pour l'exécuter seul ; branché dans `main()` avec les autres
auto-tests pour qu'il tourne toujours.

**Coût attendu** : le plus court des scénarios court sur `ENTREE_MS + GARDE_MS` = 850 ms, soit
51 images ; le plus long est la variante « décodage qui n'arrive jamais » du scénario 5,
`AFFICHE_ATTENTE_MAX_MS + CROISEMENT_MS + GARDE_MS` = 1620 ms, soit 97 images. Environ 500 relevés
en tout, un `page.evaluate` chacun — quelques secondes, sans commune mesure avec un balayage des
vraies pages.

## 4. Le relevé, une ligne par élément et par image

Sous `#app`, **calques de clones compris** (`#mvt-fantomes`, `#mvt-fond`) :

| Champ | Source | Pourquoi |
|---|---|---|
| `id` | `data-mvt`, ou `fantome:<calque>#<rang>` | un clone a perdu sa marque (`fantomes.ts` la retire) : il faut quand même le suivre d'une image à l'autre |
| `rect` | `getBoundingClientRect()` | le rectangle **vu**, transforms inclus — c'est ce que l'œil reçoit, pas `offsetLeft` |
| `opaciteEffective` | produit des `opacity` de l'élément et de tous ses ancêtres jusqu'à `#app` | une opacité d'ancêtre masque tout un sous-arbre ; lire la seule opacité propre mentirait |
| `fond` | `background-color` et son alpha, présence d'un `background-image` | c'est la définition opérationnelle de « sans fond » |
| `pile` | ordre de peinture (marche du DOM + `z-index` du calque) | savoir qui est **au-dessus** de qui |
| `texte` | présence d'un texte non vide | deux aplats superposés ne gênent personne ; deux textes, si |

`getBoundingClientRect` est ici le bon outil, à l'inverse de `marques.ts` qui l'évite délibérément :
`marques.ts` veut la position de mise en page **malgré** les animations en vol, le banc veut la
position **produite par** l'animation en vol.

## 5. Les sept scénarios

Écrits en HTML littéral au format exact des gabarits réels, joués sur la vraie feuille de style —
le patron déjà en place dans `autoTestMouvement`.

| # | Verdict | Transition jouée | Ce qu'on y cherche |
|---|---|---|---|
| 1 | `entree` | l'accueil gagne la tuile `rideau` | la cascade (`retardCascade`) : une tuile de rang 3 reste-t-elle invisible pendant son retard, ou clignote-t-elle avant ? |
| 2 | `sortie` | l'accueil perd la tuile `rideau` | le fantôme posé sur une mise en page déjà refermée |
| 2 bis | `sortie` sur `ligne:` | une ligne de tâche cochée disparaît | `.ligne-tache` sans fond : le cas nommé au § 1 |
| 3 | `deplacement` | une tuile insérée devant une autre (FLIP) | téléportation, et le dépassement de 8 % de `SPATIAL` |
| 4 | `mutation` chiffre | `17:04` → `17:05` | le roulement : existe-t-il une image où ni l'ancien ni le nouveau glyphe n'est lisible ? |
| 5 | `mutation` bloc | le bloc média change de morceau, **avec** affiche | le masque `opacity: 0`. Deux variantes : décodage à 100 ms, et décodage qui n'arrive jamais (plafond 800 ms atteint) |
| 6 | `traversee` | accueil → tâches, puis retour | l'entrante glisse au-dessus du clone de fond ; que `.corps` soit opaque est **mesuré**, pas supposé |
| 7 | `croisement` | bloc repas → bloc voiture, même place | le creux de fondu croisé du § 1 |

**Chaque scénario déclare sa signature attendue** — quels nœuds sont animés, quel calque reçoit un
clone — et le banc rougit si elle n'est pas là. Sans cette assertion, un scénario qui cesserait de
déclencher son verdict resterait vert **en ne mesurant plus rien** : le dépôt s'est déjà fait
piéger une fois (commit `1ad2821`, « test de câblage vacuement vert réparé »).

**Une exception délibérée.** Quand `FANTOMES_MAX` est atteint, `fantomer` rend `null` et la sortie
devient sèche : `moteur.ts` le documente comme un désagrément assumé, jamais une panne. Ce cas va
dans une liste d'exceptions **courte et nommée**, sur le modèle d'`EXCLUS_MOUVEMENT` — jamais dans
un seuil élargi pour faire taire le contrôle.

## 6. Les quatre détecteurs

Quatre **fonctions pures** sur la suite des relevés — aucun accès page, sur le patron de
`comparerSignatures`. C'est ce qui les rend exerçables directement, sans navigateur.

**D1 · Rupture d'opacité.** Faute si l'opacité effective d'un identifiant saute de plus de **0,5**
entre deux images consécutives, ou s'il quitte le relevé alors qu'il y était encore au-dessus de
0,5. Justification du seuil : le fondu le plus court du projet (`SORTIE_MS` = 120 ms) progresse
d'environ **0,14 par image** de 16,7 ms. 0,5 laisse trois fois la marge et ne pardonne aucune
disparition sèche (1 → absent).

**D2 · Chevauchement sans fond.** La géométrie ne fait que **désigner où regarder** : deux
rectangles qui se recoupent, celui du dessus portant du texte et un fond non opaque (alpha < 1, ou
aucun fond déclaré), celui du dessous portant du texte aussi. **Le verdict se prend en pixels** —
capture de la zone de recoupement, contraste local mesuré contre le plancher projet de **5:1**.
C'est la règle de la maison : une maquette n'est pas une mesure.

**D3 · Vide transitoire.** Une fente est l'union des rectangles de la face sortante et de la face
entrante d'un même geste (croisement, mutation de bloc, traversée) — donc une zone dont le
scénario affirme qu'elle est couverte de bout en bout, à l'image de départ comme à celle
d'arrivée. Sur cette zone, on somme les alphas composites de toutes les couches qui la recouvrent.
Si le total descend sous **0,9** à une image intermédiaire, la surface transparaît par-dessous —
confirmé au pixel central, qui doit alors avoir viré vers `--md-surface`. C'est ce détecteur qui
condamnera le creux du scénario 7, s'il existe.

**D4 · Rupture géométrique**, trois volets :

- **téléportation** — plus de 40 px de déplacement en une image sur un élément qui n'est pas neuf ;
- **cadre qui bouge** — `scrollWidth`/`scrollHeight` de `#app` doivent rester à 343 × 585 à
  **chaque** image. C'est la contrainte de conception du projet, jamais vérifiée en vol ;
- **dernière image ≠ repos** — toutes animations finies et tous minuteurs vidés, le relevé final
  doit être identique à une référence peinte avec le moteur au niveau `aucun`. Ce volet attrape
  d'un coup les `fill` mal posés et les fantômes qui survivent à leur animation.

## 7. La preuve que le contrôle sait rougir

Un vérificateur ne vaut rien tant qu'on n'a pas prouvé qu'il échoue quand il doit — `autoTest`,
`autoTestPeint` et `autoTestGardeFouMarques` existent tous pour ça. Deux étages, et les deux sont
nécessaires :

- **Les détecteurs**, étant purs, sont exercés sur des suites d'images fabriquées à la main : pour
  chacun des quatre, une suite fautive qui **doit** être condamnée et une suite propre qui **doit**
  passer. Aucun navigateur, instantané.
- **Le banc lui-même** est exercé dans un vrai Chromium sur une fixture volontairement cassée — une
  marque `data-mvt` retirée, donc une sortie sèche. S'il reste vert dessus, c'est l'horloge
  virtuelle ou le relevé qui ment, pas le gabarit.

Sans le second étage, les quatre détecteurs pourraient être parfaits et ne jamais recevoir une
seule image réelle. C'est très exactement le défaut I1 de la revue finale du chantier précédent :
l'auto-test passait parce que sa fixture posait l'élément fautif dans une forme que l'application
ne produit jamais.

## 8. Limites assumées

- **Fixtures, pas vrais gabarits.** Un fond transparent introduit demain dans un vrai rendu, qu'aucune
  fixture ne reproduit, reste un angle mort. C'est le prix du périmètre choisi au § 2 ; le garde-fou
  `data-mvt` existant, lui, tourne sur les vraies pages et couvre l'autre moitié du risque.
- **Le banc mesure la composition, pas la cadence.** Un moteur qui tomberait à 6 im/s sur la Fire 7
  passerait ce contrôle sans rougir. `mesurerImagesParSeconde` couvre cet axe, et il existe déjà.
- **Un pas de 16,7 ms manque ce qui dure moins d'une image** — mais ce qui n'atteint pas une image
  n'atteint pas l'œil non plus.
- **Niveau `complet` seulement.** À `sobre`, `deplacement` ne se joue plus : la téléportation y est
  *délibérée*, et D4 la condamnerait à tort. Les niveaux dégradés sortent du périmètre, et le
  contrôle le dit dans son en-tête plutôt que de les couvrir à moitié.
- **Chromium de bureau, pas Chrome 100.** Le banc hérite de la même approximation que le reste de
  `verifier-rendu.mjs`, qui simule ce moteur (`sansDvh`) sans être ce moteur.

## 9. Suite du chantier

Le banc en place, on le lance. Ce qu'il trouve est corrigé dans un **second temps**, avec le banc
comme preuve avant/après. Les corrections ne sont pas conçues ici : on ne sait pas encore ce qui
rougira. Deux suspects sont nommés au § 1 — le creux du fondu croisé et le fantôme de
`.ligne-tache` — et ce ne sont que des suspects.
