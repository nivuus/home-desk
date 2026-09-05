# Grammaire de mouvement des tablettes — refonte

**Date** : 2026-08-22
**Périmètre** : `tools/wallpanel-app` — `src/mouvement.ts`, `src/mouvement/`, `src/rendu/`,
`src/styles/base.css`, `outils/verifier-rendu.mjs`
**Origine** : « Des blocs s'affichent et disparaissent sans animation. » — puis, après examen de la
maquette : « Les animations doivent être le plus simple possible pour tourner sur ces tablettes.
Mais suivre au mieux le motion/morphing de MD3 Expressive. »

## 1. Le problème, en deux moitiés

Le propriétaire a confirmé voir **les deux** symptômes à la fois.

**Moitié A — des trous de couverture.** Le moteur n'anime que ce qui porte un `data-mvt`. Douze
endroits en portent un ; tout le reste apparaît et disparaît sec. Manquent notamment les deux blocs
centraux `rendreVoiture` et `rendreMinuteurs`, la rangée `.commandes` entière, et les trois
éléments conditionnels du bandeau (`.phrase`, `.dehors`, `.pastille`).

**Moitié B — le régulateur éteint tout.** `moteur.ts` documente lui-même (bloc « I6 ») que
`consommerSaccadees()` rend *tous* les rôles mesurés sous le plancher pendant une trame, et les
dégrade tous. Deux hoquets — une rafale de `state_changed`, un ramassage mémoire, un réveil
d'écran — suffisent à mettre l'écran entier à `aucun`, **sans retour avant rechargement de la
page**. La tablette du bureau n'a ni `tabReloadTimer` ni `clearCacheOnReload` : elle y reste.

## 2. Décisions du propriétaire

1. **Le régulateur est supprimé.** Plus aucune coupure automatique. Restent `?mouvement=` dans
   l'URL Fully et `prefers-reduced-motion`, décidés une fois au montage.
2. **Couverture exhaustive** : tout ce qui apparaît ou disparaît s'anime, boutons compris.
3. **Garde-fou automatique** dans `verifier-rendu.mjs` : un élément qui apparaît ou disparaît sans
   marque fait échouer la vérification.
4. **Le vocabulaire est repensé**, pas seulement étendu.
5. **Le plus simple possible, MD3 Expressive au mieux.** Les deux critères ensemble, jamais l'un
   contre l'autre.

## 3. Deux courbes remplacent cinq

MD3 Expressive repose sur des ressorts en deux familles : le **spatial** (déplacement, échelle)
peut dépasser légèrement sa cible ; les **effets** (opacité) ne dépassent jamais.

Chrome 100 — le moteur des Fire 7 — ne comprend pas `linear()`, donc pas de vrai ressort. Un
`cubic-bezier` suffit à porter le dépassement, et **le projet visait déjà ça** : `base.css:419`
déclare `linear(0, .5 30%, 1.08 55%, .98 72%, 1.01 85%, 1)` — 8 % de dépassement — derrière un
`@supports` que les Fire 7 ne satisfont jamais. L'intention Expressive est écrite dans le fichier
et n'atteint pas l'écran. On l'y amène par la seule syntaxe que ces dalles comprennent.

| Nom | Valeur | Emploi |
|---|---|---|
| `SPATIAL` | `cubic-bezier(.34, 1.5, .64, 1)` | tout ce qui se déplace ou change d'échelle ; dépasse de **8,00 %**, mesuré par échantillonnage — exactement le `1.08` que `base.css` déclarait |
| `EFFET` | `cubic-bezier(.2, 0, 0, 1)` | tout fondu à l'arrivée |
| `EFFET_SORTIE` | `cubic-bezier(.4, 0, 1, 1)` | tout fondu au départ |

Disparaissent : `COURBE`, `COURBE_SORTIE`, `COURBE_BALAYAGE` sous leurs noms actuels, et le
`linear()` sous `@supports` de `base.css` — il ne servait que `--ressort`, qui reste pour `:active`
et garde son `cubic-bezier`.

## 4. Le geste de chaque rôle

| Geste | Rôle | Durée | Courbe | Trames |
|---|---|---|---|---|
| Entrée | tous | 350 ms | `SPATIAL` | `translateY(10px)`, `opacity 0` → repos |
| Sortie | tous | 120 ms | `EFFET_SORTIE` | `opacity 1 → 0` sur un clone, **sans déplacement** |
| Croisement | `bloc` | 320 ms | `EFFET` | clone en fondu sortant, nœud réel en fondu entrant, même boîte |
| Traversée | `vue` | 320 ms | `SPATIAL` | entrante `translateX(±343px)` → repos, sortante immobile en fond |
| Roulement | `chiffre` | 140 ms | clone : `EFFET_SORTIE` ; neuf : `SPATIAL` | clone `translateY(-100%)` + fondu sortant, neuf depuis `+100%` en fondu entrant |
| Déplacement | `tuile`, `ligne` | 350 ms | `SPATIAL` | FLIP `translate(dx, dy)` → repos |
| Détail | `detail` | 140 ms | `EFFET` | `opacity` seule, aucun déplacement |

**Sortie sans déplacement** — MD3 : on n'accompagne pas ce qui part. Une propriété au lieu de deux,
et le clone vit 120 ms au lieu de 160.

**Le remplacement de bloc devient un croisement.** Aujourd'hui, un bloc central qui en remplace un
autre (repas → voiture, agenda → alerte) produit deux verdicts sans rapport : une sortie et une
entrée de clés différentes, jouées en même temps, avec la fente qui se referme puis se rouvre.
C'est le cas le plus fréquent de l'écran. Le croisement est à la fois moins cher (un clone au lieu
d'une sortie plus une entrée) et plus juste : c'est le *container transform* de MD3, un conteneur
qui change de contenu sans disparaître. Le bloc média le fait déjà — on l'étend à tout le rôle
`bloc`.

Concrètement : `comparer()` apparie une sortie et une entrée de rôle `bloc` **occupant la même
place dans le document** en un seul verdict `croisement`, au lieu de deux verdicts indépendants.

**Ce que le croisement conserve du bloc média** : le préchargement de l'affiche
(`AFFICHE_ATTENTE_MAX_MS`, `urlAffiche`, `decoder`), le masque d'attente (`masquerBloc`) et le
compteur de génération (`generationsBloc`) restent tels quels sur le chemin de la **mutation** —
un bloc média qui change de morceau sans changer de clé. L'apparition d'une affiche n'est donc
**pas** une marque `detail` : c'est une mutation du bloc.

**Correction (revue finale)** : le verdict `croisement`, lui, appelle le croisement **nu**, sans
préchargement ni masque. Une version antérieure de ce paragraphe affirmait le contraire. Croiser
*vers* la carte média montre donc un aplat le temps que l'affiche se décode. Ce n'est pas une
régression — l'ancien chemin (une sortie plus une entrée) ne préchargeait pas davantage — mais
c'est une limite à connaître, et un candidat naturel si le sujet revient.

**Nouveau rôle `detail`** — les petits éléments secondaires : boutons de transport, ± 5 min,
étiquettes de minuteur, sous-titre média, pastille du bandeau, températures. Famille « effets » :
un objet de cette taille qui se déplace lit comme du bruit, pas comme un geste.

## 5. Le balayage de tuile est supprimé

Le rôle `tuile` garde ses entrées, sorties et déplacements. Il perd son geste de mutation.

Trois raisons, dans cet ordre :

1. **Il est redondant.** `.commande` porte déjà `transition: background .3s` (`base.css:236`).
   Quand `lit` ajoute la classe `actif`, le fond fond tout seul sur 300 ms — et le moteur pose
   par-dessus deux couches opaques qui *masquent* ce fondu pour rejouer le même effet autrement.
2. **Il est cher.** Le disque fait 280 × 280 = 78 400 px² pour une tuile qui en occupe 9 632 —
   **39 % de la surface de l'écran entier**, composée à chaque bascule, sur une dalle à 130 Mo de
   libre. Pour retrouver un effet que le CSS produit gratuitement.
3. **Il ment sur l'origine du geste.** Un balayage part d'un point : le doigt. MD3 réserve le
   ripple au retour au contact. Or une tuile change le plus souvent parce que Home Assistant a
   changé l'état à distance, sans que personne n'ait touché l'écran — le balayage désigne alors une
   origine qui n'existe pas.

**Le défaut de contraste part avec.** `lit` peint la tuile dans son état d'arrivée *avant* que le
moteur ne joue le balayage : le texte prend la couleur d'arrivée à la première image pendant que le
fond porte encore celle du départ — du blanc sur `#d8dee0` pendant 380 ms, soit **environ 1,6:1**
contre un plancher projet de 5:1. Une seule déclaration règle tout :

```css
.commande { transition: background .3s, color 0s .3s; }
```

Le texte bascule à la *fin* du fondu. Pas de croisement, donc pas de creux : fondre les deux
couleurs ensemble a été essayé et mesuré sur la maquette — à mi-parcours elles se moyennent et le
texte devient plus terne que le défaut qu'on corrige.

Sont retirés : `BALAYAGE_MS`, `COURBE_BALAYAGE`, la branche `mutation`/`tuile` de `jouer()`, les
règles `.mvt-balayage*` de `base.css`, et l'attribut `data-mvt-etat` des tuiles (`corps.ts:178`) —
plus aucun verdict ne le lit pour ce rôle. `data-mvt-etat` reste pour `chiffre` et `bloc`.

## 6. Le régulateur est retiré

Disparaissent entièrement : `Compteur`, `mesurer`, `PLANCHER_FPS`, `FACTEUR_ABANDON`, `degrader`,
la carte `niveaux`, `degraderRole`, `actifRole`, et la boucle `consommerSaccadees()` de `peindre()`.
`src/mouvement.ts` se réduit à `niveauDemande` et au type `Niveau` ; `tests/mouvement.test.ts` perd
ses cas de mesure.

Ce qui reste : un niveau **fixe**, décidé une fois au montage.

| Niveau | Effet |
|---|---|
| `complet` (défaut) | tout |
| `sobre` | pas de cascade, pas de déplacement |
| `aucun` | rien — posé par `prefers-reduced-motion` ou `?mouvement=aucun` |

`Moteur.niveauDe` et `Moteur.degraderRole` quittent l'interface publique. `estMasquee` reste : un
écran éteint ne doit toujours rien animer.

## 7. Règle d'imbrication

**Un verdict d'entrée ou de sortie sur une marque annule ceux de ses descendants marqués.**

Sans cette règle, l'exhaustivité se paie deux fois. Quand le bloc média sort, il emporte son
sous-titre, ses trois boutons de transport, son rail de volume : neuf verdicts pour un seul geste,
neuf clones, et des animations imbriquées qui se composent en cascade sur un élément déjà en train
de disparaître. Avec elle, c'est un verdict et un clone.

C'est aussi ce qui permet de **garder `FANTOMES_MAX` à 12** malgré la couverture exhaustive : les
sorties en rafale viennent presque toujours d'un conteneur commun.

La règle ne s'applique qu'aux entrées et sorties. Un `deplacement` ou une `mutation` sur un
descendant reste joué : un chiffre qui roule dans un bloc qui, lui, ne fait que se déplacer, est
bien deux gestes distincts.

## 8. Couverture — ce qui doit porter une marque

Un seul mécanisme : `data-mvt="<rôle>:<clé>"` dans le gabarit, au point d'usage. Aucun second
mécanisme par sélecteurs CSS n'est introduit — deux façons de déclarer la même chose coûteraient
plus cher à lire que la verbosité qu'elles économisent.

| Fichier | Élément | Marque |
|---|---|---|
| `rendu/voiture.ts` | `.voiture` | `bloc:voiture` |
| | `.vt-niveau`, `.vt-autonomie` | `detail:vt-niveau`, `detail:vt-autonomie` |
| `rendu/minuteur.ts` | `.minuteurs` (liste) | `bloc:minuteurs` |
| | `.mn-solo` | `bloc:minuteur-solo` |
| | `.mn-etiquettes` | `detail:mn-etiquettes` |
| | `.mn-nouveau` | `detail:mn-nouveau` |
| | boutons ± 5 (`.mn-bouton`) | `detail:mn-<action>-<slot>` |
| `rendu/bandeau.ts` | `.phrase` | `detail:dedans` |
| | `.dehors` | `detail:dehors` |
| | `.pastille` | `detail:pastille` |
| `rendu/corps.ts` | `.commandes` (rangée) | `bloc:commandes` |
| | `.ambiance` | `tuile:amb-<clé>` |
| | tuile minuteur | `tuile:minuteur` |
| | `.s` (étiquette d'une tuile) | `detail:etiq-<entité>` |
| `rendu/media.ts` | `.media-sous` | `detail:media-sous` |
| | boutons de transport | `detail:tr-<action>` |
| | `.media-rail` | `detail:volume-rail` |
| | `.media-pas` (− / +) | `detail:volume-moins`, `detail:volume-plus` |
| `rendu/taches.ts` | `.taches-vide` | `detail:taches-vide` |
| | le bloc « +N tâches » | `detail:taches-reste` |
| `rendu/nuit.ts` | `.tn`, `.on` | `detail:nuit-temp`, `detail:nuit-ferme` |
| `rendu/recette.ts` | `.ing-vide` | `detail:ing-vide` |
| | `.ing-stock.manque` | `detail:manque-<i>` |

Les clés doivent rester **stables d'un rendu à l'autre pour le même objet** et **uniques dans
l'écran** : c'est la seule chose que `comparer()` regarde. Une clé dérivée d'un index de tableau
n'est acceptable que là où l'ordre ne change jamais.

## 9. Garde-fou dans `verifier-rendu.mjs`

Nouveau contrôle, sur le patron des contrôles de débordement, cible tactile et contraste déjà en
place : **échouer si un élément apparaît ou disparaît entre deux états sans porter de marque.**

Mécanique :

1. Pour chaque scénario existant, rendre l'état A, relever la signature de tous les éléments
   porteurs de classe (chemin depuis `#app` + liste de classes), rendre l'état B, relever à
   nouveau.
2. Différence symétrique des deux relevés.
3. Un élément de la différence est **fautif** s'il ne porte pas `data-mvt` et si aucun de ses
   ancêtres jusqu'à `#app` n'en porte (règle d'imbrication, § 7).
4. Le rapport nomme le fichier de rendu probable et la marque suggérée.

Sont exclus du contrôle, par une liste nommée dans le script : `#mvt-fantomes`, `#mvt-fond`, les
couches du survol DeLorean, et les éléments internes aux `<video>`/`<img>`.

Ce contrôle ne déploie rien, comme le reste de `verifier-rendu.mjs`.

## 10. Hors périmètre

- **Le contraste de `--md-tertiary-container`.** Blanc sur `#7c6d29` donne 4,86:1, sous le plancher
  de 5:1, indépendamment de tout mouvement. C'est la graine de `scripts/generer-jetons.mjs`. À
  traiter séparément.
- **La cause des redémarrages de la tablette du bureau** (cf. mémoire projet). Sans rapport avec la
  grammaire ; retirer le régulateur et le balayage réduit la charge, sans prétendre la régler.
- **`--ressort` et `:active`.** Le retour au contact reste hors moteur et instantané. C'est la
  contrainte pour laquelle ce projet existe.

## 11. Risques

| Risque | Parade |
|---|---|
| Sans régulateur, une dalle réellement lente n'a plus de repli automatique | `?mouvement=sobre` se pose depuis Fully en quelques secondes, sans reconstruire. La suppression du balayage retire par ailleurs le geste le plus cher de l'app. |
| L'exhaustivité multiplie les animations simultanées | La règle d'imbrication (§ 7) ramène un conteneur et ses enfants à un seul geste. `FANTOMES_MAX` reste à 12 : au-delà, la sortie redevient sèche, jamais une erreur. |
| Une clé instable fait clignoter un élément (sortie puis entrée à chaque peinture) | Les clés viennent d'une entité ou d'un identifiant stable, jamais d'un index sauf ordre figé. Le garde-fou du § 9 ne l'attrape pas — c'est le seul trou connu, à surveiller en revue. |
| Le croisement de blocs suppose « même place dans le document » | Si l'appariement échoue, on retombe sur l'ancien comportement (une sortie et une entrée). Dégradation lisible, jamais une erreur. |

## 12. Vérification

- `npm test` — les tests existants de `mouvement`, `moteur`, `orchestration`, `pannes` sont à
  reprendre : ils vérifient un régulateur et un balayage qui n'existent plus.
- `node outils/verifier-rendu.mjs` — dont le nouveau contrôle du § 9, qui doit passer au vert sur
  les trois pièces.
- `node outils/verifier-rendu.mjs --auto-test` — preuve que le nouveau contrôle sait échouer.
- Contrôle visuel sur les trois tablettes après `npm run build`, cache vidé.

## 13. Nettoyage

`config/www/wallpanel/maquette-mouvement.html` et `outils/maquette-mouvement.html` sont jetables :
ils ont servi à trancher le vocabulaire sur la vraie dalle. À supprimer à la fin du chantier.
