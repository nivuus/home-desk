# Bandeau des tablettes — mise en page et hiérarchie

**Date** : 2026-08-06
**Portée** : `src/rendu/bandeau.ts`, `src/styles/base.css` (`.cap`), `src/agenda.ts`, `src/meteo.ts`
**Statut** : conception validée, implémentation à planifier

## Problème

Le bandeau (`.cap`) souffre de deux défauts, identifiés par le propriétaire sur le rendu réel :

1. **Mise en page bancale.** `.cap` est une grille à deux colonnes en `align-items: start`. La
   colonne gauche (heure, date, phrase intérieure) descend plus bas que la droite (température
   extérieure, pastille) : la phrase « Il fait 27,6° ici. » pend seule en bas à gauche avec du vide
   à sa droite. L'ensemble forme un « L ».
2. **Absence de hiérarchie.** Cinq tailles de texte (42 / 24 / 14 / 11 / 10 px) se concurrencent
   sans qu'aucun signal ne distingue les natures d'information.

Deux autres réserves ont été relevées et **écartées** par le propriétaire : la densité (trois
températures dans 121 px — chiffre aligné sur la mesure de §5, qui vaut aussi bien avant qu'après
ce lot puisque la hauteur ne bouge pas) et l'écart d'identité jour/nuit du bandeau. Elles ne font
pas partie de ce lot.

## Décisions

| Question | Décision | Raison |
|---|---|---|
| Hiérarchie | **L'heure reste l'ancre unique** | Le reste est assumé comme secondaire, lisible de près seulement — plutôt que subi |
| Budget de hauteur | **Pas d'augmentation** | Le budget des 585 px est saturé ; aucune redistribution voulue |
| Structure | **Colonnes étirées, pieds alignés** | Corrige le « L » sans toucher à une seule taille de texte |
| Style | **Accent couleur sur les trois chiffres** | Une règle unique et apprenable : ce qui est coloré est une température |
| Format de l'intérieur | **`27,6°` conservé, décimale toujours affichée** | C'est une mesure directe, pas une prévision ; la décimale le dit implicitement |

Deux directions plus ambitieuses ont été maquettées et rejetées : un pied de données pleine largeur
séparé par un filet, et une heure monumentale à 54 px avec un rang de puces. Toutes deux
supprimaient la phrase « Il fait … ici », seule tournure humaine de l'écran.

## Conception

### 1. Structure — deux colonnes étirées

`.cap` conserve sa grille. Deux changements :

- `align-items: start` → **`stretch`**, pour que les deux colonnes aient la même hauteur.
- `.cap .gauche` et `.cap .droite` deviennent des flex verticaux en **`justify-content: space-between`**,
  chacun avec exactement deux enfants.

| | Haut de colonne | Bas de colonne |
|---|---|---|
| **Gauche** (`1fr`) | `.heure` + `.date` (groupés dans un `<div>`) | `.phrase` |
| **Droite** (`minmax(0, 44%)`) | `.dehors` | `.pastille` |

**La piste droite reste à `44%` — décision arrêtée après mesure, pas d'origine.** Une première
version de cette conception la portait à `46%`, au prétexte que la pastille, ne partant plus du
haut, pourrait profiter d'un peu plus de largeur sans rien coûter à la gauche puisque « la piste
gauche ne change pas ». **Ce raisonnement était faux** : la piste gauche est `1fr`, une unité
strictement relative — elle ne reçoit que ce que la grille lui laisse une fois l'autre piste
servie. Élargir `minmax(0, …%)` à droite RÉTRÉCIT donc mécaniquement `1fr` à gauche, il n'existe
aucun réglage qui élargisse une piste sans rogner l'autre dans une grille à deux colonnes dont la
somme fait 100 %. Mesuré à `46%` : la boîte de `.date` tombait de 160 px à 154 px, et sa marge de
sécurité (pire cas « dimanche 13 septembre », dérivée à chaque exécution du vérificateur) passait
de +1,6 px à -4,4 px — donc en dépassement, un texte tronqué sur le mur. Le propriétaire a corrigé
cette conception à l'exécution : **`44%`, sans discussion, tant qu'aucune piste n'est déclarée en
unité absolue plutôt qu'en `fr`/`%`.** Leçon à retenir pour une prochaine refonte de cette grille :
« l'autre piste ne change pas » est une affirmation à vérifier sur le calcul réel des largeurs, pas
à énoncer par intuition — `1fr` n'a pas de largeur propre, il n'est que ce qui reste.

La colonne gauche exige un regroupement `heure` + `date` dans un conteneur : sans lui,
`space-between` répartirait **trois** enfants et la date flotterait au milieu.

#### Cas dégradés

| Situation | Comportement |
|---|---|
| Capteur intérieur muet (`.phrase` absente) | La gauche n'a qu'un enfant, il reste en haut ; la droite peut alors devenir la plus haute et imposer la hauteur — sans conséquence, le bandeau rétrécit |
| Météo indisponible (`.dehors` et `.pastille` absentes) | La droite est vide, la gauche impose la hauteur |
| Pastille non météo (anniversaire, rendez-vous) | Structure identique, sans accent (cf. §3) |

Aucun cas ne produit de bloc flottant au milieu d'une colonne.

### 2. Accent — les trois chiffres, et eux seuls

Le fond de `.cap` change de couleur selon le moment (`--md-primary` #003c48 de jour,
`--md-surface-container-high` #2e3335 dès `moment !== 'jour'`). **Un jeton d'accent unique serait
donc invisible la moitié du temps** : `--md-primary` de jour serait exactement la couleur du fond.
D'où un jeton local, inversé avec la palette :

```css
.cap          { --cap-accent: var(--md-inverse-primary); }  /* jour : #78d3ec sur #003c48 */
.sombre .cap  { --cap-accent: var(--md-primary); }          /* nuit : #99e8ff sur #2e3335 */
.cap .val     { color: var(--cap-accent); }
```

Dans les deux cas c'est « le cyan clair » de la palette. Contrastes calculés (WCAG, sRGB) :
**7,1:1 de jour**, **9,3:1 de nuit** — au-dessus du seuil de 5:1 imposé par `verifier-rendu.mjs`.

`.val` porte sur trois fragments, et rien d'autre :

- `21°` — le `<span class="chiffre">` de `.dehors` (qui porte déjà `data-mvt="chiffre:dehors"`) ;
- `27,6°` — le `<b>` de `.phrase` ;
- `28°` — le préfixe de `.pastille .pv` (cf. §3).

**L'icône météo n'est pas colorée** : elle hérite de `currentColor` du parent `.dehors`, qui reste
dans la couleur du texte. Rien à écrire pour ça — mais l'accent ne doit donc pas être posé sur
`.dehors`, seulement sur le `<span>` intérieur.

### 3. Colorer le `28°` de la pastille — sans deviner

`Pastille` (`agenda.ts`) est aujourd'hui `{ etiquette: string; valeur: string }`, où `valeur` est une
chaîne unique. Or `pastilleBandeau` a **quatre branches**, dont deux sans aucune température :

| Branche | Exemple | Température ? |
|---|---|---|
| Anniversaire | `Aujourd'hui` / `Anniversaire de X` | non |
| Rendez-vous proche | `14:30` / `Dentiste` | non |
| Changement météo | `samedi` / `28° et de la pluie` | oui |
| Repli « demain » | `Demain` / `28° et du soleil` | oui |

Découper au rendu par une regex `^\d+°` reviendrait à **déduire le sens depuis la forme** — ce que
ce projet s'interdit (cf. `estEcart`, `rendu/corps.ts`, dont la docstring documente précisément ce
défaut sur l'ancien dispatch par domaine). Conception retenue :

- `Pastille` gagne **`accent?: string`** — le préfixe exact de `valeur` à colorer, posé par
  `agenda.ts`, **seul propriétaire du sens**. Les branches anniversaire et rendez-vous ne le
  renseignent pas ; l'absence du champ est le cas normal, pas une anomalie.
- `meteo.ts` expose **`temperatureCourte(temperature: number): string`** → `` `${Math.round(temperature)}°` ``,
  utilisée à la fois par `phraseDemain` et par les deux branches météo d'`agenda.ts`. Une seule
  source pour ce format : `valeur.startsWith(accent)` est alors vrai **par construction**, jamais par
  coïncidence. Le paramètre est un `number` et non une `Prevision` : `prochainChangement` ne rend
  que `{ jour, condition, temperature }`, et devrait sinon fabriquer une fausse prévision.
- `bandeau.ts` **vérifie `startsWith` avant de couper**. Si les deux divergeaient un jour (une
  refonte de `phraseDemain`, un format localisé), on retombe sur du texte non coloré — jamais sur un
  texte tronqué au mauvais endroit.

Le `<span>` inséré est inline à l'intérieur de `.pv`, qui reste en `display: -webkit-box` avec
`-webkit-line-clamp: 2` : le clamp sur deux lignes (déclaré dans `CLAMPS_VOULUS`,
`outils/verifier-rendu.mjs`) est inchangé.

### 4. Invariant de format : la décimale ne s'élide jamais

`bandeau.ts` formate l'intérieur avec `Number(…).toFixed(1).replace('.', ',')`. Une valeur ronde
sort donc **`28,0°`**, jamais `28°` — comportement déjà correct aujourd'hui, et **exigé** : c'est ce
qui distingue à l'œil une mesure directe (une décimale, toujours) d'une valeur arrondie (extérieur,
prévision). Le colorer rend cette distinction plus visible, donc plus fragile à une régression.

Aucun test ne le couvre actuellement (`tests/bandeau.test.ts:54` utilise `26.7`, non rond). Un test
dédié est ajouté — c'est typiquement l'invariant qu'une future « simplification » supprimerait.

### 5. Hauteur : 121 px, inchangée

**Chiffres corrigés après mesure sur la vraie page (2026-08-07).** Cette section annonçait à
l'origine « 112 px au lieu de 122 », un couple de chiffres tiré d'une maquette de navigateur à la
largeur réelle mais jamais confirmée sur la page servie aux tablettes — et donc jamais passée par
`outils/verifier-rendu.mjs`, seul juge qui fasse foi sur ce projet pour une hauteur peinte. Mesuré
pour de vrai : **121 px avant cette refonte, 121 px après.** Aucun écart.

C'est le résultat voulu, pas un raté : le budget demandé par le propriétaire est « identique, ni
plus ni moins », et cette refonte ne redistribue pas de hauteur entre `.cap` et le reste de
l'écran — elle réaligne le pied des deux colonnes À L'INTÉRIEUR de la hauteur déjà fixée par la
colonne la plus haute (`stretch` + `space-between`, cf. §1). Il n'y a donc pas de « 10 px rendus »
à faire retomber dans `.corps` : cette redistribution imaginaire n'a jamais eu lieu. Le risque de
régression reste nul dans le sens qui compte pour ce lot — le vérificateur teste les débordements
et les cibles tactiles, aucun des deux ne recule.

## Tests

À ajouter dans `tests/bandeau.test.ts` :

1. **Structure** — `.cap > .gauche` contient un conteneur groupant `.heure` et `.date`, et `.phrase`
   en est un frère direct (deux enfants exactement, sinon `space-between` est faux).
2. **Accent posé** — avec une pastille portant `accent: '28°'` et `valeur: '28° et du soleil'`, le
   `.pv` contient un `.val` dont le texte est `28°`, et le texte complet du `.pv` reste inchangé.
3. **Accent absent** — pastille sans `accent` (anniversaire) : aucun `.val` dans le `.pv`, texte intact.
4. **Garde `startsWith`** — `accent: '35°'` avec `valeur: 'Anniversaire'` : aucun `.val`, texte
   intégral préservé (jamais tronqué).
5. **Décimale d'un nombre rond** — capteur à `28` : `.phrase` contient `28,0`.
6. **Accent sur les deux autres chiffres** — `.dehors .val` et `.phrase .val` existent.

`meteo.ts` : test de `temperatureCourte` et vérification que `phraseDemain` commence par son
résultat (le contrat sur lequel repose le `startsWith`).

**jsdom ne calcule aucune mise en page** : il ne peut valider ni l'alignement des pieds, ni la
hauteur de 121 px (inchangée, §5), ni les contrastes. Ces trois points relèvent exclusivement de
`node outils/verifier-rendu.mjs`.

## Vérification

Dans l'ordre, depuis `tools/wallpanel-app` :

1. `npm test`
2. `node outils/verifier-rendu.mjs` — contraste peint réel des trois `.val` (jour **et** nuit),
   troncature de `.date` (marge de 1,6 px), pire cas de pastille `29° et des passages nuageux` sur
   deux lignes, absence de débordement.
3. `npm run build` **seulement après** — il déploie en production.
4. Vidage du cache des trois tablettes puis contrôle sur `image.tablette_<piece>_capture_d_ecran`.

Le rendu de jour (fond canard #003c48) n'a jamais été observé sur la vraie dalle pendant cette
conception — la session s'est tenue de nuit. **Le contrôle visuel de jour est obligatoire** avant de
considérer le lot terminé.

## Hors périmètre

- La densité du bandeau (trois températures) — écartée explicitement.
- L'écart d'identité jour/nuit de `.cap` — écarté explicitement.
- L'arrondi de la température intérieure — tranché : elle garde sa décimale.
- Toute modification du corps, des commandes ou de la ligne de synthèse.
