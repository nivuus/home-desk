# Vérification image par image des transitions — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE : utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> sont en cases à cocher (`- [ ]`).

**But :** doter `verifier-rendu.mjs` d'un banc qui rejoue les sept verdicts du moteur de mouvement
image par image et condamne quatre familles de trou — ruptures d'opacité, chevauchements sans
fond, vides transitoires, ruptures géométriques.

**Architecture :** une horloge virtuelle met en pause les animations WAAPI et avance de concert les
minuteurs et le décodage d'affiche (déjà injectables via `OptionsMoteur`), par pas de 16,7 ms. À
chaque pas, un relevé structurel est pris dans un vrai Chromium à 343 × 585 ; la suite des relevés
est ensuite analysée par quatre fonctions **pures**, dont deux ne rendent que des *suspects* que le
banc confirme en pixels.

**Pile technique :** Node ESM, `playwright-core` (Chromium), `esbuild` (bundle du moteur depuis
`src/`), `vitest` pour les fonctions pures.

**Spec :** `docs/superpowers/specs/2026-08-26-mouvement-verification-image-par-image-design.md`

## Contraintes globales

- **Français** partout : noms de fonctions, de variables, messages de rapport, commentaires.
- **Aucune modification de `src/`.** Le banc se branche sur les points d'injection existants
  (`rendre`, `minuteurFn`, `decoder`, `niveauInitial` de `OptionsMoteur`). Seule exception
  autorisée : ajouter des `export` à `outils/verifier-rendu.mjs` (tâche 4).
- **Cadre 343 × 585**, marge nulle. Contraste plancher **5:1**.
- **Niveau de mouvement `complet` uniquement** (`niveauInitial: 'complet'`). Les niveaux `sobre` et
  `aucun` sont hors périmètre : à `sobre`, `deplacement` ne se joue pas et la téléportation y est
  délibérée.
- **Pas de seuil élargi pour faire taire un contrôle.** Un cas délibérément non condamné va dans
  une liste **courte et nommée**, sur le modèle d'`EXCLUS_MOUVEMENT`.
- **Seuils, valeurs exactes** : `SEUIL_OPACITE = 0.5`, `ALPHA_MIN_FENTE = 0.9`,
  `SEUIL_SAUT_PX = 8`, `AIRE_MIN_CHEVAUCHEMENT = 100`, `PAS_MS = 16.7`, `CONTRASTE_MIN = 5`.
- **Commit à chaque fin de tâche**, message en français, préfixe `feat(film)` / `test(film)`.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `outils/film/detecteurs.mjs` *(créé)* | les quatre détecteurs, **purs** : aucun accès page, aucun import. Plus `chainerFantomes` et `analyserFilm`. |
| `outils/film/banc.mjs` *(créé)* | l'horloge virtuelle, le relevé page-side, le jeu d'un film, la confirmation en pixels, le rapport, l'auto-test du banc. |
| `outils/film/scenarios.mjs` *(créé)* | les sept scénarios : états A/B en HTML littéral, signature attendue, fentes, délai de décodage. |
| `outils/verifier-rendu.mjs` *(modifié)* | trois `export` en plus, câblage du drapeau `--film` dans `main()`. |
| `tests/film-detecteurs.test.mjs` *(créé)* | vitest, environnement `node` : les fonctions pures sur des suites d'images fabriquées à la main. |

Le découpage suit la seule ligne qui compte ici : **ce qui est pur d'un côté, ce qui touche au
navigateur de l'autre**. C'est ce qui permet d'exercer les détecteurs par `npm test` en quelques
millisecondes, et de garder pour le vrai Chromium la seule question qu'il est seul à pouvoir
trancher.

### Le format d'un film (contrat entre `banc.mjs` et `detecteurs.mjs`)

```js
/**
 * Element  : { id, rect: [x, y, l, h], opacite, fondAlpha, aFondImage, pile, anime, texte }
 * Image    : { t, cadre: { largeur, hauteur }, elements: Element[] }
 * Fente    : { nom, rect: [x, y, l, h] }
 * Film     : { nom, reference: Element[], repos: Element[], fentes: Fente[], images: Image[] }
 *
 * `reference` : relevé de l'état A AU REPOS, pris avant la peinture de l'état B.
 * `repos`     : relevé de l'état B peint par un moteur au niveau `aucun` (aucune animation).
 * `pile`      : ordre de peinture. Plus grand = plus haut.
 * `anime`     : l'élément OU un de ses ancêtres porte une animation en cours.
 */
```

---

### Task 1 : Chaînage des fantômes et détecteur D1 (rupture d'opacité)

**Files:**
- Create: `outils/film/detecteurs.mjs`
- Test: `tests/film-detecteurs.test.mjs`

**Interfaces:**
- Consomme : rien.
- Produit : `SEUIL_OPACITE`, `chainerFantomes(film) -> Film`,
  `detecterRuptureOpacite(film) -> Faute[]` où
  `Faute = { detecteur: string, t: number, id: string, message: string }`.

**Pourquoi le chaînage existe.** `fantomes.ts` retire `data-mvt` du clone : un fantôme est donc un
identifiant neuf qui apparaît à `opacity: 1` à l'image même où l'élément original quitte le relevé.
Sans chaînage, D1 crierait « apparaît à 1,00 » sur **chaque** sortie du projet — c'est-à-dire
partout, tout le temps. Le chaînage réécrit l'identifiant du clone en `fantome<id-original>` quand
il naît **à la même image** et **au même rectangle** (± 2 px) que l'original disparu, et les deux
ne forment plus qu'une seule chaîne d'identité.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/film-detecteurs.test.mjs` :

```js
import { describe, it, expect } from 'vitest';
import { chainerFantomes, detecterRuptureOpacite, SEUIL_OPACITE } from '../outils/film/detecteurs.mjs';

/** Un élément de relevé, avec des valeurs par défaut saines : les tests ne déclarent que ce dont
 *  ils parlent. */
const el = (id, opacite, sup = {}) => ({
  id, opacite, rect: [0, 0, 100, 64], fondAlpha: 1, aFondImage: false,
  pile: 0, anime: true, texte: true, ...sup,
});

const film = (reference, images, sup = {}) => ({
  nom: 'essai', reference, repos: [], fentes: [],
  images: images.map((elements, i) => ({ t: i * 16.7, cadre: { largeur: 343, hauteur: 585 }, elements })),
  ...sup,
});

describe('chainerFantomes', () => {
  it('rend au clone l\'identité de l\'élément qu\'il remplace', () => {
    const f = chainerFantomes(film(
      [el('tuile:rideau', 1)],
      [[el('fantome:mvt-fantomes#0', 1)]],
    ));
    expect(f.images[0].elements[0].id).toBe('fantome<tuile:rideau>');
  });

  it('ne chaîne pas un clone posé ailleurs que l\'original', () => {
    const f = chainerFantomes(film(
      [el('tuile:rideau', 1)],
      [[el('fantome:mvt-fantomes#0', 1, { rect: [200, 300, 100, 64] })]],
    ));
    expect(f.images[0].elements[0].id).toBe('fantome:mvt-fantomes#0');
  });
});

describe('detecterRuptureOpacite', () => {
  it('condamne une disparition sèche', () => {
    const fautes = detecterRuptureOpacite(film([el('tuile:rideau', 1)], [[]]));
    expect(fautes).toHaveLength(1);
    expect(fautes[0].id).toBe('tuile:rideau');
    expect(fautes[0].detecteur).toBe('D1');
  });

  it('condamne une apparition sèche', () => {
    const fautes = detecterRuptureOpacite(film([], [[el('tuile:rideau', 1)]]));
    expect(fautes).toHaveLength(1);
    expect(fautes[0].message).toMatch(/apparaît/);
  });

  it('laisse passer un fondu de 120 ms au pas de 16,7 ms', () => {
    const suite = [];
    for (let i = 1; i <= 8; i++) suite.push([el('tuile:rideau', Math.max(0, 1 - i * 0.14))]);
    expect(detecterRuptureOpacite(film([el('tuile:rideau', 1)], suite))).toEqual([]);
  });

  it('ne condamne pas un élément qui s\'éteint APRÈS être descendu sous le seuil', () => {
    const f = film([el('f', 1)], [[el('f', 0.4)], []]);
    expect(detecterRuptureOpacite(f)).toEqual([]);
  });

  it('expose le seuil documenté dans la spec', () => {
    expect(SEUIL_OPACITE).toBe(0.5);
  });
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Depuis `tools/wallpanel-app` :
Run: `npx vitest run tests/film-detecteurs.test.mjs`
Attendu : ÉCHEC — `Failed to resolve import "../outils/film/detecteurs.mjs"`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

Créer `outils/film/detecteurs.mjs` :

```js
/** Les quatre détecteurs de trou dans une transition, et rien d'autre. FONCTIONS PURES : aucun
 *  accès page, aucun import, aucun effet de bord. C'est ce qui les rend exerçables par `npm test`
 *  sur des suites d'images fabriquées à la main, sans navigateur — le même parti que
 *  `comparerSignatures` dans `verifier-rendu.mjs`.
 *
 *  Le format d'un film est décrit dans le plan de ce chantier
 *  (`docs/superpowers/plans/2026-08-26-mouvement-verification-image-par-image.md`) et produit par
 *  `outils/film/banc.mjs`. */

/** Un saut d'opacité au-delà de ce seuil, en UNE image, n'est plus un fondu. Justification du
 *  chiffre : le fondu le plus court du projet (`SORTIE_MS` = 120 ms, `src/mouvement/grammaire.ts`)
 *  progresse d'environ 0,14 par image de 16,7 ms. 0,5 laisse trois fois la marge et ne pardonne
 *  aucune disparition sèche (1 → absent). */
export const SEUIL_OPACITE = 0.5;

/** Tolérance de position pour apparier un clone à son original. Deux pixels : `fantomes.ts` pose
 *  le clone aux `position`/`taille` RELEVÉES de l'original, l'écart devrait être nul — la marge ne
 *  couvre qu'un arrondi de sous-pixel. */
const TOLERANCE_APPARIEMENT_PX = 2;

const estFantome = (id) => id.startsWith('fantome:');

const memeRectangle = (a, b) =>
  Math.abs(a[0] - b[0]) <= TOLERANCE_APPARIEMENT_PX && Math.abs(a[1] - b[1]) <= TOLERANCE_APPARIEMENT_PX
  && Math.abs(a[2] - b[2]) <= TOLERANCE_APPARIEMENT_PX && Math.abs(a[3] - b[3]) <= TOLERANCE_APPARIEMENT_PX;

/** Rend au clone l'identité de l'élément qu'il remplace. Cf. le plan, tâche 1 : sans ce chaînage,
 *  D1 condamnerait CHAQUE sortie du projet, le clone naissant à `opacity: 1` à l'image même où
 *  l'original quitte le relevé.
 *
 *  L'appariement se fait sur le rectangle ET sur la simultanéité (l'original disparaît à l'image
 *  où le clone naît), jamais sur le seul rectangle : deux clones peuvent se succéder au même
 *  endroit pendant une rafale. Une fois nommé, un clone garde son nom pour tout le reste du film —
 *  d'où la carte `adoptes`, tenue d'une image à l'autre. */
export function chainerFantomes(film) {
  const adoptes = new Map();                       // id de clone → id chaîné
  let precedent = new Map(film.reference.map((e) => [e.id, e]));
  const images = film.images.map((img) => {
    const courant = new Map(img.elements.map((e) => [e.id, e]));
    const disparus = [...precedent.values()].filter((e) => !courant.has(e.id) && !estFantome(e.id));
    for (const e of img.elements) {
      if (!estFantome(e.id) || adoptes.has(e.id)) continue;
      if (precedent.has(e.id)) continue;           // déjà là à l'image d'avant : pas une naissance
      const original = disparus.find((d) => memeRectangle(d.rect, e.rect));
      if (original !== undefined) adoptes.set(e.id, `fantome<${original.id}>`);
    }
    const elements = img.elements.map((e) =>
      adoptes.has(e.id) ? { ...e, id: adoptes.get(e.id) } : e);
    precedent = new Map(elements.map((e) => [e.id, e]));
    return { ...img, elements };
  });
  return { ...film, images };
}

/** D1 — rupture d'opacité. Compare chaque image à la précédente (la première à `reference`, le
 *  relevé de l'état A au repos : sans lui, toute la transition ressemblerait à une apparition).
 *  Un élément qui quitte le relevé est traité comme une opacité de 0, ce qui est exactement ce
 *  qu'il vaut à l'œil. */
export function detecterRuptureOpacite(film) {
  const fautes = [];
  let precedent = new Map(film.reference.map((e) => [e.id, e]));
  for (const img of film.images) {
    const courant = new Map(img.elements.map((e) => [e.id, e]));
    for (const [id, avant] of precedent) {
      const apres = courant.get(id)?.opacite ?? 0;
      if (avant.opacite - apres > SEUIL_OPACITE) {
        fautes.push({ detecteur: 'D1', t: img.t, id,
          message: `opacité ${avant.opacite.toFixed(2)} → ${apres.toFixed(2)} en une image` });
      }
    }
    for (const [id, apres] of courant) {
      if (precedent.has(id)) continue;
      if (apres.opacite > SEUIL_OPACITE) {
        fautes.push({ detecteur: 'D1', t: img.t, id,
          message: `apparaît à ${apres.opacite.toFixed(2)}, sans fondu` });
      }
    }
    precedent = courant;
  }
  return fautes;
}
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/film-detecteurs.test.mjs`
Attendu : PASS, 7 tests.

- [ ] **Étape 5 : commit**

```bash
git add outils/film/detecteurs.mjs tests/film-detecteurs.test.mjs
git commit -m "feat(film): chaînage des fantômes et détecteur de rupture d'opacité"
```

---

### Task 2 : Détecteurs D2 (chevauchement sans fond) et D3 (vide transitoire)

**Files:**
- Modify: `outils/film/detecteurs.mjs`
- Test: `tests/film-detecteurs.test.mjs`

**Interfaces:**
- Consomme : le format `Film` de la tâche 1.
- Produit : `AIRE_MIN_CHEVAUCHEMENT`, `ALPHA_MIN_FENTE`,
  `detecterChevauchement(film) -> Suspect[]`, `detecterVideTransitoire(film) -> Suspect[]`,
  `pireParGroupe(suspects) -> Suspect[]`, où
  `Suspect = { detecteur, t, zone: [x, y, l, h], groupe: string, message: string }`.
  Ces deux détecteurs ne rendent **jamais** de faute : c'est le banc qui tranche, en pixels
  (tâche 6).

**La règle qui décide de ce que D2 regarde.** Un élément dont le fond est **déclaré** opaque
(`fondAlpha === 1`, sans `background-image`) couvre ce qu'il recouvre : rien à signaler. Un élément
qui n'a **jamais** de fond opaque — `.ligne-tache` ne déclare aucun `background` — est un défaut de
structure, et c'est celui-là qu'on cherche. On ne multiplie **pas** `fondAlpha` par l'opacité en
vol : sinon tout fondu du projet deviendrait suspect, et le creux transitoire d'un fondu croisé est
précisément le sujet de D3, pas de D2.

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à `tests/film-detecteurs.test.mjs` :

```js
import { detecterChevauchement, detecterVideTransitoire, pireParGroupe,
         ALPHA_MIN_FENTE, AIRE_MIN_CHEVAUCHEMENT } from '../outils/film/detecteurs.mjs';

describe('detecterChevauchement', () => {
  it('signale un texte sans fond posé sur un autre texte', () => {
    const dessous = el('ligne:t2', 1, { rect: [0, 0, 300, 48], pile: 1 });
    const dessus = el('fantome<ligne:t1>', 0.6, { rect: [0, 0, 300, 48], pile: 1000, fondAlpha: 0 });
    const s = detecterChevauchement(film([], [[dessous, dessus]]));
    expect(s).toHaveLength(1);
    expect(s[0].detecteur).toBe('D2');
    expect(s[0].zone).toEqual([0, 0, 300, 48]);
  });

  it('épargne un dessus au fond opaque', () => {
    const dessous = el('ligne:t2', 1, { rect: [0, 0, 300, 48], pile: 1 });
    const dessus = el('fantome<ligne:t1>', 0.6, { rect: [0, 0, 300, 48], pile: 1000, fondAlpha: 1 });
    expect(detecterChevauchement(film([], [[dessous, dessus]]))).toEqual([]);
  });

  it('épargne un recoupement plus petit que l\'aire minimale', () => {
    const dessous = el('a', 1, { rect: [0, 0, 300, 48], pile: 1 });
    const dessus = el('b', 1, { rect: [299, 47, 300, 48], pile: 1000, fondAlpha: 0 });
    expect(detecterChevauchement(film([], [[dessous, dessus]]))).toEqual([]);
  });

  it('épargne deux aplats sans texte', () => {
    const dessous = el('a', 1, { rect: [0, 0, 300, 48], pile: 1, texte: false });
    const dessus = el('b', 1, { rect: [0, 0, 300, 48], pile: 1000, fondAlpha: 0, texte: false });
    expect(detecterChevauchement(film([], [[dessous, dessus]]))).toEqual([]);
  });
});

describe('detecterVideTransitoire', () => {
  const fente = { nom: 'bloc central', rect: [0, 100, 300, 120] };
  const couvre = (id, opacite) => el(id, opacite, { rect: [0, 100, 300, 120] });

  it('signale le creux d\'un fondu croisé', () => {
    // sortante à 0,25 et entrante à 0,75 : 1 − (1−0,25)(1−0,75) = 0,8125 < 0,9
    const f = { ...film([], [[couvre('fantome<bloc:repas>', 0.25), couvre('bloc:voiture', 0.75)]]),
                fentes: [fente] };
    const s = detecterVideTransitoire(f);
    expect(s).toHaveLength(1);
    expect(s[0].detecteur).toBe('D3');
    expect(s[0].zone).toEqual(fente.rect);
  });

  it('laisse passer un croisement dont les deux faces se compensent', () => {
    const f = { ...film([], [[couvre('fantome<bloc:repas>', 0.6), couvre('bloc:voiture', 0.8)]]),
                fentes: [fente] };
    expect(detecterVideTransitoire(f)).toEqual([]);
  });

  it('ignore une couche qui ne recouvre pas le centre de la fente', () => {
    const ailleurs = el('bloc:voiture', 1, { rect: [0, 400, 300, 120] });
    const f = { ...film([], [[couvre('fantome<bloc:repas>', 0.5), ailleurs]]), fentes: [fente] };
    expect(detecterVideTransitoire(f)).toHaveLength(1);
  });

  it('expose les seuils documentés dans la spec', () => {
    expect(ALPHA_MIN_FENTE).toBe(0.9);
    expect(AIRE_MIN_CHEVAUCHEMENT).toBe(100);
  });
});

describe('pireParGroupe', () => {
  it('ne garde qu\'une image par groupe, la plus grave', () => {
    const s = [
      { detecteur: 'D3', t: 0, groupe: 'D3|bloc central', gravite: 0.5, zone: [0, 0, 1, 1], message: '' },
      { detecteur: 'D3', t: 16.7, groupe: 'D3|bloc central', gravite: 0.2, zone: [0, 0, 1, 1], message: '' },
      { detecteur: 'D2', t: 0, groupe: 'D2|a>b', gravite: 0.9, zone: [0, 0, 1, 1], message: '' },
    ];
    const garde = pireParGroupe(s);
    expect(garde).toHaveLength(2);
    expect(garde.find((x) => x.groupe === 'D3|bloc central').t).toBe(16.7);
  });
});
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/film-detecteurs.test.mjs`
Attendu : ÉCHEC — `detecterChevauchement is not a function`.

- [ ] **Étape 3 : écrire l'implémentation**

Ajouter à `outils/film/detecteurs.mjs` :

```js
/** Sous cette aire, un recoupement est un artefact d'arrondi, pas une superposition que l'œil
 *  perçoit : 100 px², soit un carré de 10 px de côté sur une dalle de 343 × 585. */
export const AIRE_MIN_CHEVAUCHEMENT = 100;

/** Plancher de couverture d'une fente. Sous 0,9, un dixième de la surface du dessous transparaît :
 *  la fente s'est ouverte, ce qu'aucun geste de ce projet n'est censé faire — « aucune fente ne
 *  doit se refermer ni se rouvrir » (`croiserBloc`, `src/mouvement/moteur.ts`). */
export const ALPHA_MIN_FENTE = 0.9;

/** En dessous, un élément ne participe plus à ce que l'œil reçoit : inutile de le comparer à
 *  quoi que ce soit. */
const OPACITE_NEGLIGEABLE = 0.05;

const intersection = (a, b) => {
  const x = Math.max(a[0], b[0]);
  const y = Math.max(a[1], b[1]);
  const l = Math.min(a[0] + a[2], b[0] + b[2]) - x;
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - y;
  return l > 0 && h > 0 ? [x, y, l, h] : null;
};

const centre = ([x, y, l, h]) => [x + l / 2, y + h / 2];

const contientPoint = ([x, y, l, h], [px, py]) =>
  px >= x && px <= x + l && py >= y && py <= y + h;

/** D2 — chevauchement sans fond. Ne rend que des SUSPECTS : la géométrie dit seulement où
 *  regarder, le verdict se prend en pixels (`confirmerSuspects`, `outils/film/banc.mjs`).
 *
 *  `fondAlpha` est le fond DÉCLARÉ, jamais multiplié par l'opacité en vol — cf. le plan, tâche 2 :
 *  un fondu rend temporairement translucide un élément qui a bien un fond, et c'est le sujet de
 *  D3, pas de celui-ci. Ce que D2 cherche est structurel : un élément qui n'a JAMAIS de fond. */
export function detecterChevauchement(film) {
  const suspects = [];
  for (const img of film.images) {
    const visibles = img.elements.filter((e) =>
      e.texte && e.opacite > OPACITE_NEGLIGEABLE && e.rect[2] > 0 && e.rect[3] > 0);
    for (let i = 0; i < visibles.length; i++) {
      for (let j = i + 1; j < visibles.length; j++) {
        const [bas, haut] = visibles[i].pile < visibles[j].pile
          ? [visibles[i], visibles[j]] : [visibles[j], visibles[i]];
        if (haut.fondAlpha >= 1 && !haut.aFondImage) continue;
        const zone = intersection(bas.rect, haut.rect);
        if (zone === null || zone[2] * zone[3] < AIRE_MIN_CHEVAUCHEMENT) continue;
        suspects.push({
          detecteur: 'D2', t: img.t, zone,
          groupe: `D2|${haut.id}>${bas.id}`,
          gravite: haut.opacite,
          message: `« ${haut.id} » (fond alpha ${haut.fondAlpha}) recouvre « ${bas.id} » `
            + `sur ${zone[2]} × ${zone[3]} px`,
        });
      }
    }
  }
  return suspects;
}

/** D3 — vide transitoire. Une fente est déclarée par le scénario (union des rectangles de la face
 *  sortante et de la face entrante) : c'est une zone dont le geste AFFIRME qu'elle est couverte de
 *  bout en bout. On somme les alphas composites des couches qui recouvrent son CENTRE — le point
 *  que la confirmation en pixels ira échantillonner, pour que la mesure et le verdict portent
 *  exactement sur le même endroit. */
export function detecterVideTransitoire(film) {
  const suspects = [];
  for (const fente of film.fentes) {
    const point = centre(fente.rect);
    for (const img of film.images) {
      const couches = img.elements.filter((e) =>
        e.fondAlpha > 0 && e.opacite > 0 && contientPoint(e.rect, point));
      const decouvert = couches.reduce((acc, e) => acc * (1 - e.opacite * e.fondAlpha), 1);
      const total = 1 - decouvert;
      if (total >= ALPHA_MIN_FENTE) continue;
      suspects.push({
        detecteur: 'D3', t: img.t, zone: fente.rect,
        groupe: `D3|${fente.nom}`,
        gravite: 1 - total,
        message: `la fente « ${fente.nom} » n'est couverte qu'à ${(total * 100).toFixed(0)} % `
          + `(${couches.length} couche(s))`,
      });
    }
  }
  return suspects;
}

/** Une seule image confirmée par groupe : la plus grave. Un chevauchement dure toute la durée d'un
 *  fondu — sept ou huit images —, et capturer les pixels de chacune coûterait sept captures pour un
 *  seul défaut, toujours le même. */
export function pireParGroupe(suspects) {
  const meilleurs = new Map();
  for (const s of suspects) {
    const actuel = meilleurs.get(s.groupe);
    if (actuel === undefined || s.gravite > actuel.gravite) meilleurs.set(s.groupe, s);
  }
  return [...meilleurs.values()];
}
```

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/film-detecteurs.test.mjs`
Attendu : PASS, 16 tests.

- [ ] **Étape 5 : commit**

```bash
git add outils/film/detecteurs.mjs tests/film-detecteurs.test.mjs
git commit -m "feat(film): détecteurs de chevauchement sans fond et de vide transitoire"
```

---

### Task 3 : Détecteur D4 (rupture géométrique) et agrégateur `analyserFilm`

**Files:**
- Modify: `outils/film/detecteurs.mjs`
- Test: `tests/film-detecteurs.test.mjs`

**Interfaces:**
- Consomme : le format `Film`, `chainerFantomes`, D1, D2, D3.
- Produit : `SEUIL_SAUT_PX`, `CADRE`, `detecterRuptureGeometrique(film) -> Faute[]`,
  `analyserFilm(film) -> { fautes: Faute[], suspects: Suspect[] }`.

**Pourquoi la téléportation se mesure sur `anime`, pas sur une vitesse.** Une traversée déplace la
vue entrante de 343 px en 320 ms, et `SPATIAL` dépasse sa cible de 8 % : la vitesse de pointe d'un
geste légitime est élevée, et tout seuil en pixels par image serait soit trop lâche pour attraper
une téléportation, soit assez serré pour condamner la traversée. Le critère juste n'est pas la
vitesse mais la **cause** : un élément animé a le droit d'aller vite, un élément que rien n'anime
n'a pas le droit de bouger. D'où `SEUIL_SAUT_PX = 8`, appliqué **uniquement** aux éléments dont
`anime` est faux.

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à `tests/film-detecteurs.test.mjs` :

```js
import { detecterRuptureGeometrique, analyserFilm, SEUIL_SAUT_PX, CADRE }
  from '../outils/film/detecteurs.mjs';

describe('detecterRuptureGeometrique', () => {
  it('condamne un saut d\'un élément que rien n\'anime', () => {
    const f = film([el('tuile:a', 1, { anime: false })],
                   [[el('tuile:a', 1, { rect: [0, 60, 100, 64], anime: false })]]);
    f.repos = f.images[0].elements;
    const fautes = detecterRuptureGeometrique(f);
    expect(fautes.filter((x) => /saut/.test(x.message))).toHaveLength(1);
  });

  it('épargne le même saut sur un élément animé', () => {
    const f = film([el('vue:accueil', 1, { anime: true })],
                   [[el('vue:accueil', 1, { rect: [0, 60, 100, 64], anime: true })]]);
    f.repos = f.images[0].elements;
    expect(detecterRuptureGeometrique(f).filter((x) => /saut/.test(x.message))).toEqual([]);
  });

  it('condamne un cadre qui bouge', () => {
    const f = film([], [[]]);
    f.images[0].cadre = { largeur: 343, hauteur: 609 };
    const fautes = detecterRuptureGeometrique(f);
    expect(fautes.filter((x) => /cadre/.test(x.message))).toHaveLength(1);
  });

  it('condamne un fantôme qui survit à son animation', () => {
    const f = film([], [[el('fantome<tuile:a>', 0.3)]]);
    f.repos = [];
    const fautes = detecterRuptureGeometrique(f);
    expect(fautes.filter((x) => /survit/.test(x.message))).toHaveLength(1);
  });

  it('condamne une dernière image qui n\'est pas l\'état de repos', () => {
    const f = film([], [[el('tuile:a', 0.5)]]);
    f.repos = [el('tuile:a', 1)];
    const fautes = detecterRuptureGeometrique(f);
    expect(fautes.filter((x) => /repos/.test(x.message))).toHaveLength(1);
  });

  it('accepte une dernière image identique au repos', () => {
    const f = film([], [[el('tuile:a', 1)]]);
    f.repos = [el('tuile:a', 1)];
    expect(detecterRuptureGeometrique(f)).toEqual([]);
  });

  it('expose les constantes documentées', () => {
    expect(SEUIL_SAUT_PX).toBe(8);
    expect(CADRE).toEqual([343, 585]);
  });
});

describe('analyserFilm', () => {
  it('chaîne les fantômes AVANT de détecter, et ne condamne alors plus la sortie', () => {
    const f = film([el('tuile:rideau', 1)], [[el('fantome:mvt-fantomes#0', 1)]]);
    f.repos = [];
    const { fautes } = analyserFilm(f);
    expect(fautes.filter((x) => x.detecteur === 'D1')).toEqual([]);
  });

  it('rend les suspects déjà réduits à une image par groupe', () => {
    const dessous = el('ligne:t2', 1, { rect: [0, 0, 300, 48], pile: 1 });
    const dessus = (o) => el('fantome<ligne:t1>', o, { rect: [0, 0, 300, 48], pile: 1000, fondAlpha: 0 });
    const f = film([], [[dessous, dessus(0.9)], [dessous, dessus(0.4)]]);
    f.repos = [dessous];
    const { suspects } = analyserFilm(f);
    expect(suspects.filter((s) => s.detecteur === 'D2')).toHaveLength(1);
    expect(suspects.find((s) => s.detecteur === 'D2').t).toBe(0);
  });
});
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/film-detecteurs.test.mjs`
Attendu : ÉCHEC — `detecterRuptureGeometrique is not a function`.

- [ ] **Étape 3 : écrire l'implémentation**

Ajouter à `outils/film/detecteurs.mjs` :

```js
/** Le cadre des trois tablettes, en dur : contrainte de conception du projet (`CLAUDE.md`), pas une
 *  mesure prise au vol. */
export const CADRE = [343, 585];

/** Un élément que RIEN n'anime n'a pas le droit de bouger de plus de ça en une image. Ne s'applique
 *  jamais à un élément animé : cf. le plan, tâche 3 — le critère juste est la cause du mouvement,
 *  pas sa vitesse. */
export const SEUIL_SAUT_PX = 8;

/** Écart d'opacité toléré entre la dernière image et l'état de repos. Deux centièmes : de quoi
 *  absorber un arrondi de composition, pas un fondu resté en l'air. */
const TOLERANCE_REPOS_OPACITE = 0.02;

/** D4 — rupture géométrique, en trois volets : téléportation, cadre qui bouge, dernière image qui
 *  n'est pas l'état de repos. Le troisième volet attrape d'un coup les `fill` mal posés et les
 *  fantômes qui survivent à leur animation. */
export function detecterRuptureGeometrique(film) {
  const fautes = [];
  let precedent = new Map(film.reference.map((e) => [e.id, e]));
  for (const img of film.images) {
    if (img.cadre.largeur !== CADRE[0] || img.cadre.hauteur !== CADRE[1]) {
      fautes.push({ detecteur: 'D4', t: img.t, id: '#app',
        message: `le cadre mesure ${img.cadre.largeur} × ${img.cadre.hauteur}, `
          + `attendu ${CADRE[0]} × ${CADRE[1]}` });
    }
    const courant = new Map(img.elements.map((e) => [e.id, e]));
    for (const [id, apres] of courant) {
      const avant = precedent.get(id);
      if (avant === undefined || apres.anime) continue;
      const saut = Math.hypot(apres.rect[0] - avant.rect[0], apres.rect[1] - avant.rect[1]);
      if (saut > SEUIL_SAUT_PX) {
        fautes.push({ detecteur: 'D4', t: img.t, id,
          message: `saut de ${Math.round(saut)} px en une image, sans animation` });
      }
    }
    precedent = courant;
  }

  const derniere = film.images.at(-1);
  if (derniere !== undefined) {
    const fin = new Map(derniere.elements.map((e) => [e.id, e]));
    const repos = new Map(film.repos.map((e) => [e.id, e]));
    for (const [id, attendu] of repos) {
      const obtenu = fin.get(id);
      if (obtenu === undefined) {
        fautes.push({ detecteur: 'D4', t: derniere.t, id,
          message: 'absent de la dernière image alors qu\'il est présent au repos' });
        continue;
      }
      if (Math.abs(obtenu.opacite - attendu.opacite) > TOLERANCE_REPOS_OPACITE) {
        fautes.push({ detecteur: 'D4', t: derniere.t, id,
          message: `dernière image à ${obtenu.opacite.toFixed(2)} d'opacité, repos à `
            + `${attendu.opacite.toFixed(2)}` });
      }
      const ecart = Math.hypot(obtenu.rect[0] - attendu.rect[0], obtenu.rect[1] - attendu.rect[1]);
      if (ecart > 1) {
        fautes.push({ detecteur: 'D4', t: derniere.t, id,
          message: `dernière image à ${ecart.toFixed(1)} px de sa position de repos` });
      }
    }
    for (const id of fin.keys()) {
      if (repos.has(id)) continue;
      fautes.push({ detecteur: 'D4', t: derniere.t, id,
        message: 'survit à son animation : présent à la dernière image, absent au repos' });
    }
  }
  return fautes;
}

/** Le point d'entrée de l'analyse. Chaîne les fantômes AVANT tout détecteur (sans quoi D1
 *  condamnerait chaque sortie du projet, cf. tâche 1), puis rend d'un côté les fautes définitives
 *  (D1, D4), de l'autre les suspects que seuls les pixels peuvent trancher (D2, D3), déjà réduits
 *  à une image par groupe. */
export function analyserFilm(film) {
  const chaine = chainerFantomes(film);
  return {
    fautes: [...detecterRuptureOpacite(chaine), ...detecterRuptureGeometrique(chaine)],
    suspects: pireParGroupe([...detecterChevauchement(chaine), ...detecterVideTransitoire(chaine)]),
  };
}
```

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/film-detecteurs.test.mjs`
Attendu : PASS, 25 tests.

- [ ] **Étape 5 : lancer la suite entière pour vérifier qu'on n'a rien cassé**

Run: `npm test`
Attendu : PASS — 34 fichiers de tests (33 existants + le nouveau).

- [ ] **Étape 6 : commit**

```bash
git add outils/film/detecteurs.mjs tests/film-detecteurs.test.mjs
git commit -m "feat(film): détecteur de rupture géométrique et agrégateur d'analyse"
```

---

### Task 4 : L'horloge virtuelle et le relevé, prouvés sur un scénario

**Files:**
- Create: `outils/film/banc.mjs`
- Modify: `outils/verifier-rendu.mjs` (ajout de trois `export`)

**Interfaces:**
- Consomme : `bundlerApplication()`, `bundlerMoteur()`, `LARGEUR`, `HAUTEUR` de
  `verifier-rendu.mjs`.
- Produit : `fixtureFilm(css, codeBundle) -> string`,
  `jouerFilm(ctx, { css, codeBundle, scenario }) -> Film`, `CODE_RELEVE` (le corps de la fonction
  de relevé, sérialisée dans la page).

**Le point le plus délicat de tout le chantier.** `__peindre(étatB)` et la mise en pause des
animations doivent se produire **dans la même tâche JS**. Un `await` entre les deux laisse le
navigateur peindre, et l'image 0 est perdue — le banc mesurerait alors une transition déjà
commencée en croyant la prendre à son début. D'où un unique `page.evaluate` qui fait les deux.

- [ ] **Étape 1 : exporter ce dont le banc a besoin**

Dans `outils/verifier-rendu.mjs`, ajouter le mot-clé `export` devant trois déclarations
existantes (ne rien déplacer, ne rien renommer) :

```js
export async function bundlerApplication() {   // ~ligne 872
export async function bundlerMoteur() {        // ~ligne 4147
```

et, à côté de la déclaration de `LARGEUR`/`HAUTEUR` (chercher `const LARGEUR`), ajouter sous
celle-ci :

```js
export { LARGEUR, HAUTEUR };
```

Vérifier que rien ne casse :
Run: `node outils/verifier-rendu.mjs --auto-test`
Attendu : la sortie habituelle des auto-tests, aucun `SyntaxError`.

- [ ] **Étape 2 : écrire le banc minimal (horloge + relevé + un scénario en dur)**

Créer `outils/film/banc.mjs` :

```js
/** Le banc de vérification image par image. Rejoue une transition dans un vrai Chromium à
 *  343 × 585, avec les TROIS timelines du moteur avancées de concert par une horloge virtuelle :
 *  les animations WAAPI (mises en pause, puis `currentTime` posé à la main), les minuteurs
 *  (`minuteurFn`) et le décodage d'affiche (`decoder`). Les deux dernières sont déjà des points
 *  d'injection déclarés par `OptionsMoteur` (`src/mouvement/moteur.ts`) : ce banc s'y branche, il
 *  n'ajoute rien à `src/`. */

import { analyserFilm, CADRE } from './detecteurs.mjs';

/** Une image de dalle. 16,7 ms : ce qui n'atteint pas une image n'atteint pas l'œil non plus. */
export const PAS_MS = 16.7;

/** L'application réduite à son squelette réel, sur le patron de `fixtureMouvement`
 *  (`verifier-rendu.mjs`) — MAIS avec les trois injections de l'horloge, que celle-là n'a pas.
 *
 *  `niveauInitial: 'complet'` est posé explicitement : sans lui, le moteur relit `matchMedia` et
 *  l'URL, et un Chromium lancé avec une préférence de mouvement réduit ferait taire tout le banc
 *  sans que rien ne le dise. */
export function fixtureFilm(css, codeBundle) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
    <style>${css}</style></head>
    <body><div id="app" data-piece="salon" class="m3"></div>
    <script>${codeBundle}</script>
    <script>
      (() => {
        const horloge = { t: 0, file: [], suivant: 0, delaiDecodage: 0 };
        const naissances = new WeakMap();

        const minuteurFn = (cb, ms) => {
          const id = ++horloge.suivant;
          horloge.file.push({ id, echeance: horloge.t + ms, cb });
          return id;
        };
        // Le décodage d'affiche passe par la MÊME file que les minuteurs : c'est ce qui garantit
        // qu'il s'ordonne avec eux, plutôt que de se résoudre à une micro-tâche imprévisible.
        const decoder = () => new Promise((resoudre) => {
          if (horloge.delaiDecodage === Infinity) return;      // ne se résout jamais, exprès
          horloge.file.push({ id: ++horloge.suivant, echeance: horloge.t + horloge.delaiDecodage,
                              cb: resoudre });
        });

        const moteur = MoteurModule.creerMoteur(document.getElementById('app'), {
          rendre: (gabarit, hote) => { hote.innerHTML = gabarit; },
          minuteurFn, decoder, niveauInitial: 'complet',
          estMasquee: () => false,
        });

        /** Adopte toute animation pas encore vue (naissance = l'instant courant), la met en pause,
         *  et pose son \`currentTime\`. Rappelée à CHAQUE pas : le croisement différé du bloc média
         *  naît des centaines de millisecondes après la peinture. */
        const caler = () => {
          for (const a of document.getAnimations()) {
            if (!naissances.has(a)) { naissances.set(a, horloge.t); a.pause(); }
            const local = horloge.t - naissances.get(a);
            try { a.currentTime = Math.max(0, local); } catch (e) { /* animation morte : rien à caler */ }
          }
        };

        window.__peindreEtSaisir = (gabarit, delaiDecodage) => {
          horloge.delaiDecodage = delaiDecodage;
          moteur.peindre(gabarit);
          caler();                       // MÊME TÂCHE JS que la peinture : l'image 0 est à nous
        };

        window.__avancer = async (t) => {
          horloge.t = t;
          // Les échéances d'abord : elles peuvent CRÉER des animations (le croisement différé).
          const dus = horloge.file.filter((m) => m.echeance <= t).sort((a, b) => a.echeance - b.echeance);
          horloge.file = horloge.file.filter((m) => m.echeance > t);
          for (const m of dus) m.cb();
          await Promise.resolve();       // laisse les \`.then()\` du décodage s'exécuter
          caler();
        };

        window.__peindreAuRepos = (gabarit) => {
          const hote = document.getElementById('app');
          MoteurModule.creerMoteur(hote, {
            rendre: (g, h) => { h.innerHTML = g; },
            minuteurFn, decoder, niveauInitial: 'aucun', estMasquee: () => true,
          }).peindre(gabarit);
        };
      })();
    </script>
  </body></html>`;
}

/** Le relevé, exécuté DANS la page. Écrit en source (`page.evaluate(new Function(...))` n'est pas
 *  utilisé : Playwright sérialise la fonction telle quelle, elle ne doit donc fermer sur rien de
 *  ce module). */
export const releverImage = () => {
  const app = document.getElementById('app');
  const base = app.getBoundingClientRect();
  const elements = [];
  // Rangs de calque, repris de `base.css` : `#mvt-fond` en `z-index: -1`, le contenu en flux à 0,
  // `#mvt-fantomes` en 5. L'ordre du document ne suffit PAS — les deux calques sont insérés en
  // PREMIERS enfants de `#app` alors qu'ils se peignent, pour l'un dessous, pour l'autre dessus.
  const rangCalque = (el) => (el.closest('#mvt-fantomes') !== null ? 5
    : el.closest('#mvt-fond') !== null ? -1 : 0);
  const alphaDe = (couleur) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(couleur.trim());
    if (m === null) return 0;
    const parties = m[1].split(',').map((v) => parseFloat(v));
    return parties.length < 4 ? 1 : parties[3];
  };
  const identifiant = (el, index) => {
    if (el.dataset.mvt) return el.dataset.mvt;
    const calque = el.closest('#mvt-fantomes') !== null ? 'mvt-fantomes'
      : el.closest('#mvt-fond') !== null ? 'mvt-fond' : null;
    if (calque !== null) return `fantome:${calque}#${index}`;
    return `${[...el.classList].sort().join('.')}@${index}`;
  };
  let ordre = 0;
  const marche = (el, opaciteHeritee, animeHerite) => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    const opacite = opaciteHeritee * parseFloat(st.opacity);
    const anime = animeHerite || el.getAnimations().length > 0;
    const index = ordre++;
    // On MARCHE tout l'arbre (l'opacité et l'animation s'héritent), mais on ne RELÈVE que ce qui
    // peut porter un défaut : une marque, un clone, ou du texte en propre.
    const aTexte = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
    const dansCalque = el.closest('#mvt-fantomes') !== null || el.closest('#mvt-fond') !== null;
    if (el.dataset.mvt || dansCalque || aTexte) {
      const r = el.getBoundingClientRect();
      elements.push({
        id: identifiant(el, index),
        rect: [Math.round(r.left - base.left), Math.round(r.top - base.top),
               Math.round(r.width), Math.round(r.height)],
        opacite, fondAlpha: alphaDe(st.backgroundColor),
        aFondImage: st.backgroundImage !== 'none',
        pile: rangCalque(el) * 1e6 + index,
        anime, texte: aTexte,
      });
    }
    for (const enfant of el.children) marche(enfant, opacite, anime);
  };
  for (const enfant of app.children) marche(enfant, 1, false);
  return { cadre: { largeur: app.scrollWidth, hauteur: app.scrollHeight }, elements };
};
```

- [ ] **Étape 3 : écrire le jeu d'un film**

Ajouter à `outils/film/banc.mjs` :

```js
/** Joue une transition et rend son film. `scenario` : voir `outils/film/scenarios.mjs`. */
export async function jouerFilm(ctx, { css, codeBundle, scenario }) {
  const page = await ctx.newPage();
  try {
    await page.setContent(fixtureFilm(css, codeBundle));

    // L'état A, peint SANS mouvement : c'est le point de départ, il ne doit rien animer.
    await page.evaluate((a) => window.__peindreAuRepos(a), scenario.etatA);
    const reference = (await page.evaluate(releverImage)).elements;

    // L'état B, peint par le moteur au niveau `complet`, animations saisies dans la même tâche.
    await page.evaluate(([b, delai]) => window.__peindreEtSaisir(b, delai),
      [scenario.etatB, scenario.delaiDecodage ?? 0]);

    const images = [];
    for (let t = 0; t <= scenario.dureeMs; t += PAS_MS) {
      await page.evaluate((x) => window.__avancer(x), t);
      images.push({ t: Math.round(t * 10) / 10, ...(await page.evaluate(releverImage)) });
    }

    // L'état de repos : une page NEUVE, l'état B peint par un moteur au niveau `aucun`. Jamais la
    // même page — celle-ci porte des animations calées et des clones vivants.
    const pageRepos = await ctx.newPage();
    let repos;
    try {
      await pageRepos.setContent(fixtureFilm(css, codeBundle));
      await pageRepos.evaluate((b) => window.__peindreAuRepos(b), scenario.etatB);
      repos = (await pageRepos.evaluate(releverImage)).elements;
    } finally {
      await pageRepos.close();
    }

    const fentes = (scenario.fentes ?? []).map((f) => ({
      nom: f.nom,
      rect: union(rectDe(reference, f.idSortant), rectDe(repos, f.idEntrant)),
    }));
    return { nom: scenario.nom, reference, repos, fentes, images, page };
  } catch (e) {
    await page.close();
    throw e;
  }
}

const rectDe = (releve, id) => {
  const e = releve.find((x) => x.id === id);
  if (e === undefined) throw new Error(`fente : aucun élément « ${id} » dans le relevé`);
  return e.rect;
};

const union = (a, b) => {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
};
```

La page reste **ouverte** dans le film rendu : la confirmation en pixels (tâche 6) doit pouvoir y
revenir, la recaler à l'instant fautif et capturer. C'est l'appelant qui la ferme.

- [ ] **Étape 4 : prouver l'horloge sur un scénario en dur**

Ajouter à la fin de `outils/film/banc.mjs` un contrôle exécutable directement :

```js
/** Preuve minimale que l'horloge tient : une entrée de tuile doit être relevée à une opacité
 *  STRICTEMENT croissante, de 0 à 1, sur ~21 images. Si l'horloge ne calait rien, toutes les
 *  images seraient identiques (animation en vol libre, relevée au hasard) ou toutes à 1
 *  (animation déjà finie). Exécutable seul : `node outils/film/banc.mjs`. */
export function verifierProgression(film, id) {
  const suite = film.images.map((img) => img.elements.find((e) => e.id === id)?.opacite ?? 0);
  const croissante = suite.every((v, i) => i === 0 || v >= suite[i - 1] - 0.001);
  const amplitude = Math.max(...suite) - Math.min(...suite);
  return { ok: croissante && amplitude > 0.9, suite, croissante, amplitude };
}
```

Puis un point d'entrée temporaire en bas du fichier, à retirer à la tâche 7 :

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const { chromium } = await import('playwright-core');
  const { bundlerApplication, bundlerMoteur, LARGEUR, HAUTEUR } = await import('../verifier-rendu.mjs');
  const nav = await chromium.launch({ headless: true });
  const { css } = await bundlerApplication();
  const codeBundle = await bundlerMoteur();
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR },
                                     reducedMotion: 'no-preference' });
  const tuile = (cle) => `<div class="commande" data-mvt="tuile:${cle}"><div><div class="t">X</div></div></div>`;
  const film = await jouerFilm(ctx, { css, codeBundle, scenario: {
    nom: 'preuve horloge',
    etatA: `<div class="corps" data-mvt="vue:accueil">${tuile('a')}</div>`,
    etatB: `<div class="corps" data-mvt="vue:accueil">${tuile('a')}${tuile('b')}</div>`,
    dureeMs: 350,
  } });
  console.log(verifierProgression(film, 'tuile:b'));
  await film.page.close();
  await nav.close();
}
```

- [ ] **Étape 5 : lancer la preuve**

Run: `node outils/film/banc.mjs`
Attendu : `{ ok: true, suite: [...], croissante: true, amplitude: >0.9 }` — une suite d'opacités
qui monte de 0 à 1. Si `amplitude` vaut 0, l'horloge ne cale rien : chercher un `await` glissé
entre la peinture et `caler()`.

- [ ] **Étape 6 : commit**

```bash
git add outils/film/banc.mjs outils/verifier-rendu.mjs
git commit -m "feat(film): horloge virtuelle et relevé image par image"
```

---

### Task 5 : Les sept scénarios

**Files:**
- Create: `outils/film/scenarios.mjs`
- Modify: `outils/film/banc.mjs` (assertion de signature attendue)

**Interfaces:**
- Consomme : `jouerFilm` de la tâche 4.
- Produit : `SCENARIOS` — un tableau de
  `{ nom, verdict, etatA, etatB, dureeMs, delaiDecodage?, fentes?, signature }`, où
  `signature = { animes: string[], clones: { 'mvt-fantomes'?: number, 'mvt-fond'?: number } }` ;
  et `verifierSignature(film, signature) -> { ok, detail }`.

**Pourquoi la signature attendue.** Un scénario qui cesserait de déclencher son verdict resterait
vert **en ne mesurant plus rien**. Le dépôt s'est déjà fait piéger (commit `1ad2821`, « test de
câblage vacuement vert réparé »). Chaque scénario déclare donc quels identifiants doivent porter
une animation à l'image 0, et combien de clones chaque calque doit recevoir.

- [ ] **Étape 1 : écrire les scénarios**

Créer `outils/film/scenarios.mjs` :

```js
/** Les sept verdicts du moteur, un scénario chacun, en HTML littéral au format EXACT des gabarits
 *  réels (`src/rendu/`) — mêmes classes, mêmes marques `data-mvt`. C'est ce qui les fait jouer sur
 *  la vraie feuille de style, avec les vrais fonds : un scénario qui inventerait ses classes
 *  mesurerait un écran qui n'existe pas. */

const tuile = (cle, actif = false) => `
  <div class="commande ${actif ? 'actif' : ''}" data-mvt="tuile:${cle}">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
         stroke-width="1.9"><path d="M9.2 18h5.6"/></svg>
    <div><div class="t">Lumières</div><div class="s">${actif ? 'Allumé' : 'Éteint'}</div></div>
  </div>`;

const accueil = (tuiles) => `
  <div class="corps" data-mvt="vue:accueil">
    <div class="etiquette">Ambiance</div>
    <div class="commandes">${tuiles}</div>
  </div>`;

const ligne = (cle, texte) =>
  `<div class="ligne-tache" data-mvt="ligne:${cle}"><div class="lt-texte">${texte}</div></div>`;

const taches = (lignes) => `
  <div class="corps" data-mvt="vue:taches">
    <div class="etiquette">Tâches</div>${lignes}
  </div>`;

const bandeau = (heure) => `
  <div class="cap"><div class="gauche">
    <div class="heure">${[...heure].map((c, i) =>
      `<span class="chiffre" data-mvt="chiffre:${i}" data-mvt-etat="${c}">${c}</span>`).join('')}</div>
    <div class="date">mercredi 26 août</div>
  </div><div class="droite"></div></div>`;

/** Le bloc média, au format de `rendu/media.ts` : l'affiche est un FOND CSS sur `.media-affiche`,
 *  jamais un `<img>` (cf. le commentaire de `rendreCarteMedia`) — c'est ce que `urlAffiche` va
 *  chercher, et donc ce qui déclenche le chemin différé du croisement. */
const media = (cle, titre, affiche) => `
  <div class="media" data-mvt="bloc:${cle}" style="--progression:0">
    <div class="media-affiche" style="background-image:url('${affiche}')"></div>
    <div class="media-texte"><div class="media-titre">${titre}</div></div>
  </div>`;

/** Un PNG 1 × 1 en data-URI : une affiche qui se décode instantanément, sans réseau. */
const AFFICHE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const blocVoiture = `
  <div class="vt" data-mvt="bloc:voiture"><div class="vt-titre">Peugeot e208</div></div>`;

const blocRepas = `
  <div class="rp" data-mvt="bloc:repas"><div class="rp-titre">Gaspacho</div></div>`;

export const SCENARIOS = [
  {
    nom: '1 · entrée d\'une tuile (cascade)',
    verdict: 'entree',
    etatA: accueil(tuile('lumiere')),
    etatB: accueil(tuile('lumiere') + tuile('rideau')),
    dureeMs: 850,
    signature: { animes: ['tuile:rideau'], clones: {} },
  },
  {
    nom: '2 · sortie d\'une tuile',
    verdict: 'sortie',
    etatA: accueil(tuile('lumiere') + tuile('rideau')),
    etatB: accueil(tuile('lumiere')),
    dureeMs: 850,
    signature: { animes: [], clones: { 'mvt-fantomes': 1 } },
  },
  {
    nom: '2 bis · sortie d\'une ligne de tâche (sans fond déclaré)',
    verdict: 'sortie',
    etatA: taches(ligne('t1', 'Changer une pile') + ligne('t2', 'Vider le bac')),
    etatB: taches(ligne('t2', 'Vider le bac')),
    dureeMs: 850,
    signature: { animes: [], clones: { 'mvt-fantomes': 1 } },
  },
  {
    nom: '3 · déplacement (FLIP)',
    verdict: 'deplacement',
    etatA: accueil(tuile('lumiere') + tuile('rideau')),
    etatB: accueil(tuile('neuve') + tuile('lumiere') + tuile('rideau')),
    dureeMs: 850,
    signature: { animes: ['tuile:neuve', 'tuile:rideau'], clones: {} },
  },
  {
    nom: '4 · roulement de chiffre',
    verdict: 'mutation',
    etatA: bandeau('17:04') + accueil(tuile('lumiere')),
    etatB: bandeau('17:05') + accueil(tuile('lumiere')),
    dureeMs: 640,
    signature: { animes: ['chiffre:4'], clones: { 'mvt-fantomes': 1 } },
  },
  {
    nom: '5 · mutation du bloc média, affiche décodée à 100 ms',
    verdict: 'mutation',
    etatA: media('media', 'Morceau A', AFFICHE),
    etatB: media('media', 'Morceau B', AFFICHE),
    dureeMs: 940,
    delaiDecodage: 100,
    fentes: [{ nom: 'bloc média', idSortant: 'bloc:media', idEntrant: 'bloc:media' }],
    signature: { animes: ['bloc:media'], clones: {} },
  },
  {
    nom: '5 bis · mutation du bloc média, affiche qui n\'arrive jamais',
    verdict: 'mutation',
    etatA: media('media', 'Morceau A', AFFICHE),
    etatB: media('media', 'Morceau B', AFFICHE),
    dureeMs: 1620,
    delaiDecodage: Infinity,
    fentes: [{ nom: 'bloc média', idSortant: 'bloc:media', idEntrant: 'bloc:media' }],
    signature: { animes: ['bloc:media'], clones: {} },
  },
  {
    nom: '6 · traversée accueil → tâches',
    verdict: 'traversee',
    etatA: accueil(tuile('lumiere')),
    etatB: taches(ligne('t1', 'Changer une pile')),
    dureeMs: 820,
    fentes: [{ nom: 'vue', idSortant: 'vue:accueil', idEntrant: 'vue:taches' }],
    signature: { animes: ['vue:taches'], clones: { 'mvt-fond': 1 } },
  },
  {
    nom: '6 bis · traversée tâches → accueil',
    verdict: 'traversee',
    etatA: taches(ligne('t1', 'Changer une pile')),
    etatB: accueil(tuile('lumiere')),
    dureeMs: 820,
    fentes: [{ nom: 'vue', idSortant: 'vue:taches', idEntrant: 'vue:accueil' }],
    signature: { animes: ['vue:accueil'], clones: { 'mvt-fond': 1 } },
  },
  {
    nom: '7 · croisement de blocs centraux',
    verdict: 'croisement',
    etatA: taches(blocRepas),
    etatB: taches(blocVoiture),
    dureeMs: 820,
    fentes: [{ nom: 'bloc central', idSortant: 'bloc:repas', idEntrant: 'bloc:voiture' }],
    signature: { animes: ['bloc:voiture'], clones: { 'mvt-fantomes': 1 } },
  },
];
```

- [ ] **Étape 2 : écrire la vérification de signature**

Ajouter à `outils/film/banc.mjs` :

```js
/** La contre-épreuve d'un scénario : le verdict attendu s'est-il RÉELLEMENT joué ? Sans elle, un
 *  scénario qui ne déclenche plus rien reste vert en ne mesurant plus rien — cf. le plan, tâche 5.
 *
 *  Lue à l'image 0 pour les animations (c'est là qu'elles naissent) et sur TOUT le film pour les
 *  clones (celui du croisement différé naît des centaines de millisecondes plus tard). */
export function verifierSignature(film, signature) {
  const manques = [];
  const image0 = film.images[0];
  for (const id of signature.animes) {
    const e = image0.elements.find((x) => x.id === id);
    if (e === undefined) { manques.push(`« ${id} » absent de l'image 0`); continue; }
    if (!e.anime) manques.push(`« ${id} » n'est animé par rien à l'image 0`);
  }
  for (const [calque, attendu] of Object.entries(signature.clones)) {
    const vus = new Set();
    for (const img of film.images) {
      for (const e of img.elements) {
        if (e.id.startsWith(`fantome:${calque}#`) || e.id.startsWith('fantome<')) vus.add(e.id);
      }
    }
    if (vus.size < attendu) {
      manques.push(`${calque} : ${vus.size} clone(s) vu(s), ${attendu} attendu(s)`);
    }
  }
  return { ok: manques.length === 0, detail: manques.join(' ; ') };
}
```

- [ ] **Étape 3 : lancer les dix scénarios et vérifier que chacun déclenche son verdict**

Remplacer le point d'entrée temporaire de `banc.mjs` (tâche 4, étape 4) par :

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const { chromium } = await import('playwright-core');
  const { bundlerApplication, bundlerMoteur, LARGEUR, HAUTEUR } = await import('../verifier-rendu.mjs');
  const { SCENARIOS } = await import('./scenarios.mjs');
  const nav = await chromium.launch({ headless: true });
  const { css } = await bundlerApplication();
  const codeBundle = await bundlerMoteur();
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR },
                                     reducedMotion: 'no-preference' });
  for (const scenario of SCENARIOS) {
    const film = await jouerFilm(ctx, { css, codeBundle, scenario });
    const sig = verifierSignature(film, scenario.signature);
    console.log(`${sig.ok ? '✓' : '✗'} ${scenario.nom} — ${film.images.length} images${sig.ok ? '' : ` — ${sig.detail}`}`);
    await film.page.close();
  }
  await nav.close();
}
```

Run: `node outils/film/banc.mjs`
Attendu : dix lignes, **toutes** en `✓`, avec entre 39 et 98 images chacune. Une ligne en `✗` ne
signifie pas forcément un défaut du moteur : commencer par vérifier que le scénario déclenche bien
le verdict qu'il annonce (une clé `data-mvt` mal recopiée suffit à le manquer).

- [ ] **Étape 4 : commit**

```bash
git add outils/film/scenarios.mjs outils/film/banc.mjs
git commit -m "feat(film): les sept verdicts en scénarios, avec contre-épreuve de signature"
```

---

### Task 6 : Confirmation en pixels des suspects D2 et D3

**Files:**
- Modify: `outils/film/banc.mjs`

**Interfaces:**
- Consomme : `analyserFilm` (tâche 3), le film et sa `page` encore ouverte (tâche 4).
- Produit : `CONTRASTE_MIN`, `confirmerSuspects(film, suspects) -> Faute[]`.

**Ce que les pixels tranchent.** Pour D2, le contraste **réellement peint** dans la zone de
recoupement : deux textes superposés produisent une bouillie dont le contraste s'effondre sous le
plancher projet de 5:1. Pour D3, la couleur du **point central** de la fente : si elle a viré vers
`--md-surface`, c'est que la fente s'est ouverte pour de bon.

- [ ] **Étape 1 : écrire la confirmation**

Ajouter à `outils/film/banc.mjs` :

```js
/** Le plancher du projet, partout : `CLAUDE.md`, et déjà appliqué par `verifier-rendu.mjs`. */
export const CONTRASTE_MIN = 5;

/** Distance sRGB en deçà de laquelle deux couleurs sont « la même » à l'œil. 12 sur 255 par canal :
 *  assez large pour absorber un anticrénelage, assez serré pour distinguer `--md-surface` d'un fond
 *  de tuile (`--md-surface-container-high`), qui en sont à plus de 20. */
const DISTANCE_COULEUR = 12;

const luminance = ([r, v, b]) => {
  const c = [r, v, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const contraste = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Convertit une zone exprimée dans le repère de `#app` (celui de tout le relevé) en `clip` de
 *  capture, exprimé dans le repère de la page. Les deux coïncident aujourd'hui — `#app` remplit le
 *  cadre —, mais un banc qui le supposerait mentirait le jour où une marge apparaît. */
async function clipDeLaZone(page, zone) {
  return page.evaluate(([x, y, l, h]) => {
    const base = document.getElementById('app').getBoundingClientRect();
    return { x: base.left + x, y: base.top + y, width: l, height: h };
  }, zone);
}

/** Les couleurs distinctes d'une capture PNG, avec leur compte. Décodage minimal : Playwright rend
 *  un PNG, et `sharp`/`pngjs` ne sont pas des dépendances de ce projet — on passe donc la capture
 *  à la page dans un `<img>` et on la lit dans un `<canvas>`. */
async function couleursDe(page, png) {
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx2d = c.getContext('2d');
    ctx2d.drawImage(img, 0, 0);
    const d = ctx2d.getImageData(0, 0, c.width, c.height).data;
    const comptes = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const cle = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
    }
    const centre = ((Math.floor(c.height / 2) * c.width) + Math.floor(c.width / 2)) * 4;
    return {
      couleurs: [...comptes.entries()].sort((a, b) => b[1] - a[1])
        .map(([cle, n]) => ({ rvb: cle.split(',').map(Number), n })),
      centre: [d[centre], d[centre + 1], d[centre + 2]],
    };
  }, png.toString('base64'));
}

/** Confirme — ou écarte — chaque suspect, en pixels réellement peints. Recale l'horloge à l'instant
 *  du suspect avant de capturer : les animations sont en pause, la capture montre donc exactement
 *  l'image analysée, pas une image voisine. */
export async function confirmerSuspects(film, suspects, couleurSurface) {
  const fautes = [];
  for (const s of suspects) {
    await film.page.evaluate((t) => window.__avancer(t), s.t);
    const clip = await clipDeLaZone(film.page, s.zone);
    const png = await film.page.screenshot({ clip });
    const { couleurs, centre } = await couleursDe(film.page, png);
    if (s.detecteur === 'D2') {
      // Les deux couleurs les plus présentes de la zone : le fond dominant et l'encre dominante.
      const [fond, encre] = couleurs;
      if (encre === undefined) continue;                 // aplat uni : rien ne se superpose
      const c = contraste(fond.rvb, encre.rvb);
      if (c < CONTRASTE_MIN) {
        fautes.push({ detecteur: 'D2', t: s.t, id: s.groupe,
          message: `${s.message} — contraste peint ${c.toFixed(2)}:1, plancher ${CONTRASTE_MIN}:1` });
      }
      continue;
    }
    const ecart = Math.max(...centre.map((v, i) => Math.abs(v - couleurSurface[i])));
    if (ecart <= DISTANCE_COULEUR) {
      fautes.push({ detecteur: 'D3', t: s.t, id: s.groupe,
        message: `${s.message} — le centre de la fente est peint en `
          + `rgb(${centre.join(', ')}), soit la surface nue` });
    }
  }
  return fautes;
}

/** La couleur de `--md-surface`, lue dans la page plutôt qu'écrite en dur : les jetons sont générés
 *  (`npm run jetons`) et changeraient sous un contrôle qui les recopierait. */
export async function couleurSurfaceDe(page) {
  return page.evaluate(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--md-surface').trim();
    const d = document.createElement('div');
    d.style.color = v;
    document.body.appendChild(d);
    const rgb = getComputedStyle(d).color;
    d.remove();
    return (rgb.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  });
}
```

- [ ] **Étape 2 : prouver la confirmation sur le scénario 2 bis**

Dans le point d'entrée temporaire de `banc.mjs`, remplacer la boucle par :

```js
  const { analyserFilm } = await import('./detecteurs.mjs');
  for (const scenario of SCENARIOS) {
    const film = await jouerFilm(ctx, { css, codeBundle, scenario });
    const sig = verifierSignature(film, scenario.signature);
    const surface = await couleurSurfaceDe(film.page);
    const { fautes, suspects } = analyserFilm(film);
    const confirmees = await confirmerSuspects(film, suspects, surface);
    console.log(`${sig.ok ? '✓' : '✗'} ${scenario.nom} — ${film.images.length} images, `
      + `${fautes.length} faute(s), ${suspects.length} suspect(s) dont ${confirmees.length} confirmé(s)`);
    for (const f of [...fautes, ...confirmees]) console.log(`      ${f.detecteur} @${f.t}ms — ${f.id} : ${f.message}`);
    await film.page.close();
  }
```

Run: `node outils/film/banc.mjs`
Attendu : dix lignes, chacune suivie de ses fautes s'il y en a. Le chantier ne préjuge pas de ce
qui rougira — c'est précisément ce qu'on cherche. Ce qui **doit** être vrai : aucune exception,
aucun scénario en `✗`, et un compte de suspects fini (si un scénario en produit des centaines, le
regroupement de `pireParGroupe` n'est pas branché).

- [ ] **Étape 3 : commit**

```bash
git add outils/film/banc.mjs
git commit -m "feat(film): confirmation en pixels des chevauchements et des vides"
```

---

### Task 7 : L'auto-test du banc, le rapport et le drapeau `--film`

**Files:**
- Modify: `outils/film/banc.mjs` (rapport + auto-test, retrait du point d'entrée temporaire)
- Modify: `outils/verifier-rendu.mjs` (câblage dans `main()`)

**Interfaces:**
- Consomme : tout ce qui précède.
- Produit : `lancerBanc(nav) -> number` (code de sortie), `autoTestBanc(nav) -> number`.

**Pourquoi un auto-test en plus des tests vitest.** Les vingt-cinq tests de la tâche 3 prouvent que
les détecteurs condamnent ce qu'ils doivent — sur des images **fabriquées à la main**. Ils ne
prouvent rien sur l'horloge ni sur le relevé : les quatre détecteurs pourraient être parfaits et ne
jamais recevoir une seule image réelle. C'est exactement le défaut I1 de la revue finale du
chantier précédent, où l'auto-test passait sur une forme que l'application ne produit jamais. Le
banc est donc exercé, dans un vrai Chromium, sur une transition **volontairement cassée**.

- [ ] **Étape 1 : écrire l'auto-test du banc**

Retirer le bloc `if (import.meta.url === ...)` de `banc.mjs` et ajouter à sa place :

```js
/** Une transition volontairement cassée : la tuile qui sort ne porte AUCUNE marque `data-mvt`.
 *  Le moteur ne rend alors aucun verdict pour elle, aucun clone n'est posé, et elle disparaît sec
 *  — exactement la « rupture d'opacité » que D1 existe pour condamner. Si le banc reste vert
 *  là-dessus, c'est l'horloge ou le relevé qui ment, pas le gabarit. */
const TUILE_NUE = `<div class="commande"><div><div class="t">Sans marque</div></div></div>`;
const SCENARIO_CASSE = {
  nom: 'preuve — sortie sèche d\'un élément sans marque',
  etatA: `<div class="corps" data-mvt="vue:accueil"><div class="commandes">
    <div class="commande" data-mvt="tuile:lumiere"><div><div class="t">Lumières</div></div></div>
    ${TUILE_NUE}</div></div>`,
  etatB: `<div class="corps" data-mvt="vue:accueil"><div class="commandes">
    <div class="commande" data-mvt="tuile:lumiere"><div><div class="t">Lumières</div></div></div>
    </div></div>`,
  dureeMs: 350,
};

/** Et sa CONTRE-ÉPREUVE : la même transition, la tuile marquée cette fois. Le moteur la sort en
 *  fondu, D1 doit se taire. Sans cette moitié, un banc qui condamnerait TOUT passerait pour un
 *  banc qui marche. */
const SCENARIO_SAIN = {
  nom: 'contre-épreuve — la même sortie, marquée',
  etatA: SCENARIO_CASSE.etatA.replace('class="commande"><div><div class="t">Sans marque',
    'class="commande" data-mvt="tuile:rideau"><div><div class="t">Sans marque'),
  etatB: SCENARIO_CASSE.etatB,
  dureeMs: 850,
};

export async function autoTestBanc(nav) {
  console.log('Auto-test du banc image par image — une sortie sèche doit être vue, la même sortie '
    + 'animée ne doit pas l\'être :');
  const { bundlerApplication, bundlerMoteur, LARGEUR, HAUTEUR } = await import('../verifier-rendu.mjs');
  const { css } = await bundlerApplication();
  const codeBundle = await bundlerMoteur();
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR },
                                     reducedMotion: 'no-preference' });
  let echecs = 0;
  try {
    for (const [scenario, doitRougir] of [[SCENARIO_CASSE, true], [SCENARIO_SAIN, false]]) {
      const film = await jouerFilm(ctx, { css, codeBundle, scenario });
      try {
        const { fautes } = analyserFilm(film);
        const d1 = fautes.filter((f) => f.detecteur === 'D1');
        const ok = doitRougir ? d1.length > 0 : d1.length === 0;
        if (!ok) echecs++;
        console.log(`  ${ok ? '✓' : '✗'} ${scenario.nom} — ${d1.length} rupture(s) d'opacité`);
      } finally {
        await film.page.close();
      }
    }
  } finally {
    await ctx.close();
  }
  console.log('');
  if (echecs > 0) {
    console.error('Auto-test du banc en échec : le banc ne détecte pas (ou détecte à tort) une '
      + 'disparition sèche — il n\'a alors aucune valeur de preuve.');
    return 1;
  }
  console.log('Auto-test du banc réussi.');
  return 0;
}
```

- [ ] **Étape 2 : écrire le rapport**

Ajouter à `outils/film/banc.mjs` :

```js
/** Joue les dix scénarios, analyse, confirme en pixels, imprime. Rend 1 dès qu'une faute survit à
 *  la confirmation, ou dès qu'un scénario ne déclenche plus son verdict. */
export async function lancerBanc(nav) {
  console.log('Vérification image par image des transitions — sept verdicts, quatre familles de '
    + 'trou, horloge virtuelle au pas de 16,7 ms :');
  const { bundlerApplication, bundlerMoteur, LARGEUR, HAUTEUR } = await import('../verifier-rendu.mjs');
  const { SCENARIOS } = await import('./scenarios.mjs');
  const { css } = await bundlerApplication();
  const codeBundle = await bundlerMoteur();
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR },
                                     reducedMotion: 'no-preference' });
  let echecs = 0;
  try {
    for (const scenario of SCENARIOS) {
      const film = await jouerFilm(ctx, { css, codeBundle, scenario });
      try {
        const sig = verifierSignature(film, scenario.signature);
        if (!sig.ok) {
          echecs++;
          console.error(`  ✗ ${scenario.nom} — le verdict ne s'est pas joué : ${sig.detail}`);
          console.error('      Un scénario qui ne déclenche rien ne mesure rien : corriger le '
            + 'scénario avant de conclure quoi que ce soit sur le moteur.');
          continue;
        }
        const surface = await couleurSurfaceDe(film.page);
        const { fautes, suspects } = analyserFilm(film);
        const confirmees = await confirmerSuspects(film, suspects, surface);
        const toutes = [...fautes, ...confirmees].sort((a, b) => a.t - b.t);
        if (toutes.length === 0) {
          console.log(`  ✓ ${scenario.nom} — ${film.images.length} images, aucun trou`);
          continue;
        }
        echecs++;
        console.error(`  ✗ ${scenario.nom} — ${toutes.length} trou(s) sur ${film.images.length} images :`);
        for (const f of toutes) {
          console.error(`      ${f.detecteur} à ${Math.round(f.t)} ms — ${f.id} : ${f.message}`);
        }
      } finally {
        await film.page.close();
      }
    }
  } finally {
    await ctx.close();
  }
  console.log('');
  return echecs > 0 ? 1 : 0;
}
```

- [ ] **Étape 3 : câbler `--film` dans `main()`**

Dans `outils/verifier-rendu.mjs`, en tête de fichier, ajouter à côté des autres imports :

```js
import { lancerBanc, autoTestBanc } from './film/banc.mjs';
```

Puis, dans `main()`, **avant** la branche `if (process.argv.includes('--auto-test'))`, insérer :

```js
    // Le banc image par image : `--film` seul le lance, `--film --auto-test` prouve d'abord qu'il
    // sait rougir. Branche à part, jamais fondue dans `--auto-test` : celui-ci prouve que les
    // vérificateurs détectent leurs défauts, celui-là MESURE le moteur — deux questions
    // différentes, deux codes de sortie.
    if (process.argv.includes('--film')) {
      process.exitCode = process.argv.includes('--auto-test')
        ? await autoTestBanc(nav)
        : await lancerBanc(nav);
      return;
    }
```

Et, dans la branche `--auto-test` existante, ajouter l'auto-test du banc à la chaîne des codes :

```js
      const codeBanc = await autoTestBanc(nav);
      process.exitCode = codeGeometrie || codePeint || codeTactile || codeContact || codeCadre
        || codeMouvement || codeGardeFouMarques || codeBanc;
```

- [ ] **Étape 4 : lancer l'auto-test du banc**

Run: `node outils/verifier-rendu.mjs --film --auto-test`
Attendu : deux lignes `✓` (la sortie sèche est vue, la sortie marquée est épargnée), puis
`Auto-test du banc réussi.`, code de sortie 0.

Si la contre-épreuve rougit — la sortie **marquée** produit quand même une rupture d'opacité — ne
pas relever le seuil : c'est le signe que le chaînage des fantômes (tâche 1) n'apparie pas le clone
à son original. Vérifier le rectangle relevé du clone contre celui de l'original.

- [ ] **Étape 5 : lancer la suite d'auto-tests complète**

Run: `node outils/verifier-rendu.mjs --auto-test`
Attendu : tous les auto-tests existants passent, plus l'auto-test du banc, code de sortie 0.

- [ ] **Étape 6 : commit**

```bash
git add outils/film/banc.mjs outils/verifier-rendu.mjs
git commit -m "feat(film): rapport, auto-test du banc et drapeau --film"
```

---

### Task 8 : Première exécution réelle et relevé de ce qui rougit

**Files:**
- Create: `docs/superpowers/plans/2026-08-26-mouvement-releve-premier-passage.md`

**Interfaces:**
- Consomme : `lancerBanc` (tâche 7).
- Produit : le relevé des trous réellement trouvés, qui servira de point de départ au **second
  temps** du chantier (les corrections, hors périmètre de ce plan).

**Aucune correction dans cette tâche.** La spec est explicite : les corrections ne sont pas conçues
d'avance, on ne sait pas encore ce qui rougira. Le rôle de cette tâche est de **constater**, avec
assez de détail pour qu'un second chantier puisse partir de là.

- [ ] **Étape 1 : lancer le banc et capturer sa sortie**

```bash
node outils/verifier-rendu.mjs --film 2>&1 | tee /tmp/user/0/claude-0/-opt-nivuus-HomeAssistant-data/593c4b76-1168-4659-af52-ab9ba2ced4fd/scratchpad/film-premier-passage.txt
echo "code de sortie : $?"
```

- [ ] **Étape 2 : écrire le relevé**

Créer `docs/superpowers/plans/2026-08-26-mouvement-releve-premier-passage.md` avec, pour **chaque**
trou trouvé : le scénario, le détecteur, l'instant, l'identifiant, la mesure, et une phrase disant
si c'est un défaut du moteur ou une limite du banc. Les deux suspects nommés par la spec — le creux
du fondu croisé (scénario 7) et le fantôme de `.ligne-tache` (scénario 2 bis) — doivent y recevoir
une réponse explicite : confirmés, ou écartés avec la mesure qui les écarte.

Si le banc ne trouve **rien**, l'écrire aussi, et dire ce que cela signifie : les sept gestes du
moteur sont propres au pas de 16,7 ms, au niveau `complet`, sur les fixtures — pas que les
tablettes n'ont aucun trou (cf. les limites du § 8 de la spec).

- [ ] **Étape 3 : commit**

```bash
git add docs/superpowers/plans/2026-08-26-mouvement-releve-premier-passage.md
git commit -m "docs(film): relevé du premier passage du banc image par image"
```

- [ ] **Étape 4 : rendre compte au propriétaire**

Présenter le relevé, et **demander** avant toute correction : certains trous peuvent être des
comportements assumés (le masque du bloc média en est un candidat déclaré), et la décision de les
corriger n'appartient pas à l'implémenteur.

---

## Auto-revue du plan

**Couverture de la spec.**

| Section de la spec | Tâche(s) |
|---|---|
| § 3 horloge, trois timelines | 4 |
| § 3 pause dans la même tâche JS, relevé de référence avant peinture | 4 |
| § 3 drapeau `--film`, câblage dans `main()` | 7 |
| § 4 relevé, six champs | 4 |
| § 5 les sept scénarios (dix films) | 5 |
| § 5 signature attendue | 5 |
| § 5 exception nommée `FANTOMES_MAX` | *voir ci-dessous* |
| § 6 D1 | 1 |
| § 6 D2 | 2 et 6 |
| § 6 D3 | 2 et 6 |
| § 6 D4, trois volets | 3 |
| § 7 preuve des détecteurs (hors navigateur) | 1, 2, 3 |
| § 7 preuve du banc (vrai Chromium, fixture cassée) | 7 |
| § 8 niveau `complet` uniquement | contraintes globales, tâche 4 (`niveauInitial: 'complet'`) |
| § 9 premier passage et relevé | 8 |

**Le trou trouvé par cette revue, et sa réponse.** La spec § 5 exige une liste d'exceptions nommée
pour le cas `FANTOMES_MAX` (sortie sèche assumée quand le calque est plein). Aucune tâche ne la
créait. Elle n'est pourtant pas nécessaire **ici** : aucun des dix scénarios ne produit douze
clones simultanés, le cas ne peut donc pas se présenter et une liste vide serait du code mort. La
décision retenue est de **ne pas** créer la liste tant qu'un scénario ne l'exige pas, et de le dire
dans l'en-tête de `detecteurs.mjs`. Si un futur scénario en rafale est ajouté, c'est **lui** qui
apportera la liste, à côté du cas qui la justifie.

**Cohérence des types.** `Faute` (`{ detecteur, t, id, message }`) est rendue par D1, D4 et
`confirmerSuspects` ; `Suspect` (`{ detecteur, t, zone, groupe, gravite, message }`) par D2 et D3,
et n'est jamais confondue avec une faute — `analyserFilm` les rend dans deux champs distincts.
`jouerFilm` rend un `Film` **plus** une `page` ouverte, que tous les appelants ferment dans un
`finally`.
