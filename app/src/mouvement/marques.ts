import { estRole, type Role } from './grammaire';

export type Position = readonly [number, number];
export type Taille = readonly [number, number];

export type Marque = {
  role: Role;
  cle: string;
  /** `data-mvt-etat`, ou `null` quand l'élément n'en déclare pas. */
  etat: string | null;
  el: HTMLElement;
  position: Position;
  /** Largeur/hauteur au moment du relevé — CAPTURÉE ici, jamais relue sur `el` plus tard (ronde
   *  de correction 1) : un verdict `sortie` porte sur une marque du relevé « avant », dont `el` a
   *  déjà été détaché du DOM par `rendre()` au moment où `jouer()` l'anime. Dans un vrai
   *  navigateur, `offsetWidth`/`offsetHeight` d'un élément détaché valent 0 — un fantôme qui
   *  relirait `m.el.offsetWidth` à cet instant se poserait donc systématiquement à taille nulle,
   *  invisible, ratant exactement ce pour quoi le calque existe. */
  taille: Taille;
  /** Rang dans l'ordre du document, pour la cascade. */
  rang: number;
  /** Clone du nœud pris AU RELEVÉ — jamais relu plus tard sur `el`, qui reste le nœud RÉEL. Sans
   *  cette copie, un fantôme construit sur `el` risquerait de cloner un nœud que `lit` a réutilisé
   *  et déjà réécrit d'ici là (le piège qui a figé l'écran une demi-journée du temps
   *  d'`animerNombres`, cf. `src/mouvement.ts`) : `el` persiste souvent d'un rendu à l'autre (`lit`
   *  patche en place plutôt que de recréer), mais un `cloneNode` pris ici, à cet instant précis,
   *  reste figé quoi que `lit` fasse ensuite à `el`. Seuls les rôles dont le texte peut changer
   *  SOUS le même nœud (`chiffre` — et, tâche 7, `bloc`) en ont besoin ; les autres n'en paient pas
   *  le coût. */
  copie?: HTMLElement;
};

/** Rôles dont le glyphe/contenu peut être réécrit EN PLACE par `lit`, d'où le besoin d'une copie
 *  figée au relevé (cf. `Marque.copie`). `bloc` (tâche 7) : le bloc média change d'affiche/titre
 *  sans changer de clé — sans cette copie, le fantôme du croisement porterait la NOUVELLE affiche
 *  (le même piège que `chiffre`, cf. le roulement de chiffres dans `moteur.ts`). */
const ROLES_AVEC_COPIE: Role[] = ['chiffre', 'bloc'];

/** Position par défaut, exprimée dans le repère de `racine` (revue finale, C1) — jamais
 *  `getBoundingClientRect`, qui rendrait une position fausse pendant qu'une animation est en vol
 *  (un `transform` d'ancêtre fausse le rect, pas `offsetLeft`/`offsetTop`, et rien ne garantit
 *  qu'aucun ancêtre n'est en train d'animer au moment du relevé).
 *
 *  `offsetLeft`/`offsetTop` sont relatifs à `offsetParent`, PAS à `racine` : tant que les 12
 *  marques historiques vivaient toutes en enfant direct de `#app` (`offsetParent === racine`),
 *  lire `el.offsetLeft` suffisait — l'invariant tenait par accident. Cette branche a posé des
 *  marques sous `.media-texte`/`.media-rangee`, qui sont elles-mêmes positionnées (`position:
 *  relative`, `base.css`) et deviennent donc l'`offsetParent` de leurs enfants marqués : le calque
 *  `#mvt-fantomes`, lui, reste positionné sur `#app`. Sans conversion de repère, un fantôme se
 *  pose à la position relevée dans la MAUVAISE origine — mesuré dans un vrai Chromium,
 *  `detail:media-sous` à `[0, 32]` au lieu de `[32, 314]`.
 *
 *  On remonte donc la chaîne des `offsetParent` en accumulant `offsetLeft`/`offsetTop` jusqu'à
 *  atteindre `racine` (ou une chaîne épuisée — élément détaché, `display: none` — auquel cas on
 *  s'arrête simplement là où elle casse, plutôt que de boucler). Injectable comme avant : jsdom
 *  laisse `offsetLeft`/`offsetTop`/`offsetParent` à 0/0/`null`, la boucle s'arrête donc
 *  immédiatement et rend `[0, 0]`, sans changement de comportement pour les tests existants qui
 *  ne fournissent pas leur propre `positionDe`. */
export const positionReelle = (el: HTMLElement, racine: HTMLElement): Position => {
  let x = 0;
  let y = 0;
  let courant: HTMLElement | null = el;
  while (courant !== null && courant !== racine) {
    x += courant.offsetLeft;
    y += courant.offsetTop;
    courant = courant.offsetParent as HTMLElement | null;
  }
  return [x, y];
};

/** Taille par défaut, sur le même patron que `positionReelle` : injectable parce que jsdom ne
 *  calcule aucune mise en page (`offsetWidth`/`offsetHeight` y valent 0 partout). */
export const tailleReelle = (el: HTMLElement): Taille => [el.offsetWidth, el.offsetHeight];

/** Revue finale (2026-08-06) — les propriétés HÉRITÉES sans lesquelles un fantôme de `chiffre` ne
 *  ressemble à rien. `.chiffre` (`base.css`) ne déclare QUE `display: inline-block` : sa taille
 *  vient de `.heure` (42 px, `letter-spacing: -1.5px`, `line-height: 1`) et sa couleur de `.cap`
 *  (`--md-on-primary`). Un fantôme est reparenté dans `#mvt-fantomes`, enfant direct de `#app` : il
 *  perd donc TOUS ses ancêtres d'un coup. Mesuré dans un vrai Chromium — original 42 px /
 *  `rgb(255,255,255)`, fantôme 16 px / `rgb(12,18,20)` sur un fond `.cap` de `rgb(0,60,72)`, soit
 *  1,56:1 contre un plancher projet de 5:1. Sur le mur : chaque minute, l'ancien chiffre
 *  disparaissait sec et un glyphe minuscule quasi invisible roulait à sa place — 1440 fois par
 *  jour, sur trois murs, sur l'élément le plus regardé de l'écran.
 *
 *  Liste NOMMÉE plutôt qu'une copie de tout le style calculé : recopier les ~340 propriétés d'un
 *  `CSSStyleDeclaration` figerait aussi la mise en page (`display`, `position`, `width`…) et
 *  ferait du fantôme un objet impossible à animer. Seules les propriétés que l'élément n'a AUCUN
 *  moyen de retrouver une fois détaché de ses ancêtres sont recopiées. */
const TYPOGRAPHIE_HERITEE = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric',
  'line-height', 'letter-spacing', 'word-spacing', 'text-transform', 'text-align', 'color',
] as const;

/** Fige sur `copie` la typographie EFFECTIVE de `source`, lue pendant que `source` est encore
 *  dans l'arbre — c'est le seul instant où elle existe (un élément détaché n'a plus de style
 *  calculé utile). `styleDe` est injectable pour la même raison que `positionReelle`/
 *  `tailleReelle` ci-dessus : jsdom ne résout pratiquement aucune cascade, un test ne peut donc
 *  vérifier ce comportement qu'en fournissant la sienne. Ne lève jamais : une valeur vide (jsdom,
 *  propriété inconnue) est simplement ignorée. */
export function figerTypographie(
  source: HTMLElement,
  copie: HTMLElement,
  styleDe: (el: HTMLElement) => { getPropertyValue: (p: string) => string } =
    (el) => getComputedStyle(el),
): void {
  const s = styleDe(source);
  for (const p of TYPOGRAPHIE_HERITEE) {
    const v = s.getPropertyValue(p);
    if (v) copie.style.setProperty(p, v);
  }
}

/** Le clone figé au relevé : le sous-arbre TEL QU'IL EST peint à cet instant, plus la typographie
 *  que ce sous-arbre ne pourra plus retrouver une fois reparenté dans le calque fantôme (revue
 *  finale, cf. `figerTypographie` — c'est le défaut du roulement de chiffres). Lu ICI, dans
 *  `lireMarques`, et jamais plus tard : c'est le dernier moment où l'élément est encore sous ses
 *  ancêtres. */
const copieFigee = (el: HTMLElement): HTMLElement => {
  const c = el.cloneNode(true) as HTMLElement;
  figerTypographie(el, c);
  return c;
};

/** Relève les éléments marqués, indexés par leur déclaration complète (`<rôle>:<clé>`). L'ordre
 *  d'insertion de la `Map` est celui du document : `rang` en découle. */
export function lireMarques(
  racine: HTMLElement,
  // `racine` en second paramètre (C1) : `positionReelle` doit savoir où arrêter de remonter la
  // chaîne des `offsetParent` pour exprimer la position dans le repère de `racine`, celui du
  // calque de fantômes. Une fonction injectée à un seul paramètre reste compatible (TypeScript
  // autorise une fonction à ignorer des arguments qu'on lui passe en trop), donc les tests
  // existants qui fournissent leur propre `positionDe: (el) => ...` continuent de compiler tels
  // quels.
  positionDe: (el: HTMLElement, racine: HTMLElement) => Position = positionReelle,
  tailleDe: (el: HTMLElement) => Taille = tailleReelle,
): Map<string, Marque> {
  const marques = new Map<string, Marque>();
  let rang = 0;
  for (const el of Array.from(racine.querySelectorAll<HTMLElement>('[data-mvt]'))) {
    const decl = el.dataset.mvt ?? '';
    const sep = decl.indexOf(':');
    if (sep <= 0 || sep === decl.length - 1) continue;   // « tuile », « tuile: », « :x »
    const role = decl.slice(0, sep);
    if (!estRole(role)) continue;
    marques.set(decl, {
      role, cle: decl.slice(sep + 1), etat: el.dataset.mvtEtat ?? null,
      el, position: positionDe(el, racine), taille: tailleDe(el),
      rang: rang++,
      copie: ROLES_AVEC_COPIE.includes(role) ? copieFigee(el) : undefined,
    });
  }
  return marques;
}
