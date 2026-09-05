/** Le rail de progression de la carte média — celui qui doit AVANCER, pas seulement se poser.
 *
 *  Le spec l'exige deux fois : « un rail fin qui **avance réellement**, décompté côté navigateur
 *  entre deux mises à jour de `media_position` » et « avance en continu ». C'est ce rail qui,
 *  SANS AFFICHE — le cas YouTube, le plus fréquent sur cette installation — donne sa vie au bloc.
 *  Jusqu'à la revue de la tâche 15, `rendu/media.ts` calculait `position / duree` au moment du
 *  rendu et ne lisait jamais `media_position_updated_at` : le rail ne bougeait qu'au redessin, à
 *  partir d'une position que Home Assistant ne republie pas en continu (il publie la position ET
 *  l'instant où elle a été relevée, à charge du client de faire le reste).
 *
 *  DEUX HORLOGES, et c'est délibéré :
 *
 *  - l'horloge MURALE (`Date.now`) sert UNE SEULE FOIS, à l'ancrage : c'est la seule qui puisse
 *    se comparer à `media_position_updated_at`, qui est un instant absolu publié par HA ;
 *  - l'horloge MONOTONE (`performance.now`) fait avancer le rail entre deux ancrages.
 *
 *  Ce projet a déjà payé cher la confusion des deux (cf. `attendreEcranVivant` dans
 *  `outils/verifier-rendu.mjs` : un saut d'heure figée faisait franchir `SEUIL_MUET_MS` à
 *  `Connexion` et peignait l'écran « Hors ligne » par-dessus les modes). Un rail décompté sur
 *  `Date.now` ferait un bond de quatre mois à chaque saut d'horloge, et resterait FIGÉ sous une
 *  horloge gelée — ce qui rendrait au passage impossible sa vérification par
 *  `outils/verifier-rendu.mjs`, qui fige `Date` pour atteindre la vue « jour ».
 *
 *  Fonctions pures : aucune horloge implicite, aucun DOM, aucun Home Assistant. */

/** Ce que `media.ts` sait dire de l'avancement d'une lecture, tel quel depuis les attributs.
 *  `majLe` est l'instant absolu (ms) où Home Assistant a relevé `position` — absent chez les
 *  lecteurs qui ne publient pas `media_position_updated_at`, auquel cas on n'extrapole rien
 *  plutôt que d'inventer une origine. */
export type Progression = {
  position: number;
  duree: number;
  majLe?: number;
  /** Le lecteur QUI PORTE la progression est en lecture. En pause, le rail se fige : c'est la
   *  demande explicite de la revue (« arrête l'extrapolation quand le lecteur est en pause »),
   *  et c'est aussi ce que fait Home Assistant, qui republie alors la position sans la faire
   *  courir. */
  avance: boolean;
};

/** Un point de départ figé : « à cet instant-là de l'horloge monotone, la lecture en était à
 *  `secondes` ». Tout ce dont le rail a besoin ensuite, sans jamais relire ni l'état ni l'heure
 *  murale. */
export type Ancre = { secondes: number; duree: number; avance: boolean; ancreMs: number };

/** Combien de secondes de retard le client peut rattraper à l'ancrage. Au-delà, l'écart ne
 *  décrit plus une lecture en cours mais un état PÉRIMÉ : websocket muet depuis une heure, page
 *  réveillée après une nuit d'écran éteint, `media_position_updated_at` d'une session terminée
 *  restée dans les attributs. Le rattraper d'un coup enverrait le rail au bout du morceau, ce qui
 *  est faux et surtout invérifiable. Une heure : très au-delà de tout silence normal (30 s,
 *  `SEUIL_MUET_MS`) et de la durée de n'importe quel morceau, mais en deçà d'une nuit. */
const RATTRAPAGE_MAX_S = 3600;

/** Fige un point de départ. `maintenantMs` est l'horloge MURALE (`Date.now`), `horlogeMs`
 *  l'horloge MONOTONE (`performance.now`) — les deux prises au même instant.
 *  Rend `null` quand il n'y a rien à montrer (pas de progression, durée nulle ou absurde) :
 *  l'appelant laisse alors le rail à zéro, jamais à une valeur inventée. */
export function ancrerProgression(
  p: Progression | undefined, maintenantMs: number, horlogeMs: number,
): Ancre | null {
  if (!p || !Number.isFinite(p.duree) || p.duree <= 0) return null;
  if (!Number.isFinite(p.position)) return null;
  // Le retard depuis le relevé de HA, rattrapé à l'ancrage. Jamais négatif (une horloge de
  // tablette en avance sur celle du serveur ferait sinon RECULER le rail), jamais au-delà du
  // plafond ci-dessus.
  const retard = p.avance && p.majLe !== undefined && Number.isFinite(p.majLe)
    ? Math.min(RATTRAPAGE_MAX_S, Math.max(0, (maintenantMs - p.majLe) / 1000))
    : 0;
  return {
    secondes: Math.max(0, p.position + retard),
    duree: p.duree,
    avance: p.avance,
    ancreMs: horlogeMs,
  };
}

/** La fraction 0→1 à lire dans `--progression`, `horlogeMs` étant l'horloge MONOTONE.
 *  Bornée des deux côtés : au-delà de la durée, le rail reste plein plutôt que de déborder de son
 *  bloc (`calc(var(--progression) * 100%)`, `base.css`) — un morceau fini dont HA n'a pas encore
 *  publié la fin est un cas courant, pas une anomalie. */
export function fractionAncree(a: Ancre | null, horlogeMs: number): number {
  if (a === null) return 0;
  const ecoule = a.avance ? a.secondes + Math.max(0, (horlogeMs - a.ancreMs) / 1000) : a.secondes;
  return Math.min(1, Math.max(0, ecoule / a.duree));
}

/** La fraction directement, sans passer par une ancre : le chemin du RENDU, où les deux horloges
 *  sont prises au même instant et où il n'y a rien à faire avancer encore. */
export function fractionProgression(
  p: Progression | undefined, maintenantMs: number,
): number {
  return fractionAncree(ancrerProgression(p, maintenantMs, 0), 0);
}
