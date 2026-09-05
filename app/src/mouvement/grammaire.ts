/** Les jetons du mouvement — SOURCE UNIQUE. Le moteur anime en Web Animations API : ces durées
 *  n'existent plus en CSS. `base.css` ne garde que `--ressort`, pour `:active`, qui reste hors
 *  moteur et instantané. */

/** MD3 Expressive repose sur des ressorts en DEUX familles : le SPATIAL (déplacement, échelle)
 *  peut dépasser légèrement sa cible ; les EFFETS (opacité) ne dépassent jamais.
 *
 *  Chrome 100 — le moteur des Fire 7 — ne comprend pas `linear()`, donc pas de vrai ressort. Un
 *  `cubic-bezier` porte le dépassement, et le projet visait DÉJÀ ça : `base.css` déclarait
 *  `linear(0, .5 30%, 1.08 55%, …)` — derrière un `@supports` que ces dalles ne satisfont jamais.
 *  L'intention Expressive était écrite dans le fichier et n'atteignait pas l'écran ; on l'y amène
 *  par la seule syntaxe que ces dalles comprennent.
 *
 *  ATTENTION en choisissant les coefficients : une Bézier ne PASSE PAS par ses points de
 *  contrôle, elle est seulement tirée vers eux — leur ordonnée n'est donc PAS le dépassement
 *  réel de la courbe (mesurer, jamais lire un coefficient au hasard). `cubic-bezier(.34, 1.5,
 *  .64, 1)` a été retenu après échantillonnage de la courbe : il dépasse sa cible de 8 %,
 *  maximum atteint vers 60 % de la course (t = 0,6) — exactement le `1.08` du `linear()`
 *  ci-dessus, porté sur la seule syntaxe que Chrome 100 comprend. */
export const SPATIAL = 'cubic-bezier(.34, 1.5, .64, 1)';
export const EFFET = 'cubic-bezier(.2, 0, 0, 1)';
/** Tout ce qui s'en va : on n'accompagne pas ce qui part. */
export const EFFET_SORTIE = 'cubic-bezier(.4, 0, 1, 1)';

export const ENTREE_MS = 350;
/** TOUJOURS plus courte que l'entrée : un écran doit se remplir, pas se vider. */
export const SORTIE_MS = 120;
export const CROISEMENT_MS = 320;
export const TRAVERSEE_MS = 320;
export const ROULEMENT_MS = 140;
export const DEPLACEMENT_MS = 350;
/** Les petits éléments secondaires. Un objet de cette taille qui se déplace lit comme du bruit,
 *  pas comme un geste : famille « effets », opacité seule. */
export const DETAIL_MS = 140;
/** L'UNIQUE durée du projet qui soit aussi une durée CSS : `base.css` la lit dans `--mvt-palette`
 *  (`.fondu-palette`), variable que `creerMoteur` pose sur `<html>` à partir de cette constante. */
export const PALETTE_MS = 600;

/** Décalage par rang dans une cascade. */
export const CASCADE_MS = 30;
/** Au-delà, le dernier élément d'une longue liste arriverait une demi-seconde après le premier :
 *  la cascade cesse d'être un rythme et devient une attente. */
export const CASCADE_RANGS_MAX = 4;

/** Translation verticale d'une entrée. Un seul lecteur (`jouer()`, branche `entree` de
 *  `moteur.ts`) : la sortie est un FONDU SEUL depuis 2026-08-22 (MD3 n'accompagne pas ce qui
 *  part), et le rôle `detail` entre lui aussi en opacité seule (un objet de sa taille qui se
 *  déplace lit comme du bruit) — cette constante ne s'applique donc ni à l'un ni à l'autre. */
export const AMPLITUDE_PX = 10;
/** Translation latérale d'une traversée de vue : la LARGEUR DU CADRE, parce que la vue entrante
 *  part hors écran et glisse par-dessus la sortante, comme une pile de cartes. L'ancien `POUSSEE_PX`
 *  valait 28 px — un décalage, pas un glissement : il ne se lisait que grâce au fondu qui
 *  l'accompagnait, et les deux écrans bougeaient ensemble. Le propriétaire a tranché : « juste un
 *  glissé depuis la droite suffira ».
 *
 *  343 px en dur plutôt que la largeur mesurée : le cadre de ces tablettes est figé à 343 × 585 px
 *  par contrainte de conception (cf. `CLAUDE.md`), et une mesure lue au vol vaudrait 0 dans jsdom —
 *  les tests ne verrouilleraient alors plus rien. */
export const GLISSE_VUE_PX = 343;

/** Au-delà, on croise sans attendre : un mur ne reste pas bloqué sur une image qui ne vient pas. */
export const AFFICHE_ATTENTE_MAX_MS = 800;

/** Au-delà, les sorties redeviennent sèches : une rafale de `state_changed` ne doit pas pouvoir
 *  remplir le calque de clones. */
export const FANTOMES_MAX = 12;
/** Retrait inconditionnel d'un fantôme, en plus de la fin d'animation : aucun clone ne survit à un
 *  `requestAnimationFrame` suspendu (l'écran de la tablette qui s'éteint la nuit). */
export const GARDE_MS = 500;

export type Role = 'vue' | 'bloc' | 'tuile' | 'ligne' | 'chiffre' | 'detail';

const ROLES: Role[] = ['vue', 'bloc', 'tuile', 'ligne', 'chiffre', 'detail'];

/** Un `data-mvt` illisible est ignoré, jamais une exception : un écran mural ne meurt pas d'une
 *  faute de frappe dans un gabarit. */
export function estRole(v: string): v is Role {
  return (ROLES as string[]).includes(v);
}

export function retardCascade(rang: number): number {
  return Math.min(rang, CASCADE_RANGS_MAX) * CASCADE_MS;
}
