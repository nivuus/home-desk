/** Les minuteurs de cuisine : lecture, tri, décompte. Fonctions pures — aucun DOM, aucune horloge
 *  implicite, aucun appel de service. C'est ce qui les rend testables sans navigateur.
 *
 *  L'état vit dans Home Assistant (helpers `timer.*`), jamais dans la page : Android tue
 *  régulièrement Fully sur ces Fire 7, et un minuteur porté par le navigateur disparaîtrait en
 *  silence pendant une cuisson. Ce module ne fait que LIRE ce que HA publie.
 *
 *  DEUX HORLOGES, comme `progression.ts` et pour la même raison :
 *  - l'horloge MURALE (`Date.now`) sert une seule fois, à la lecture de `finishes_at`, seul
 *    instant absolu publié par HA ;
 *  - l'horloge MONOTONE (`performance.now`) fait descendre le décompte entre deux redessins.
 *  Un décompte fondé sur `Date.now` ferait un bond à chaque saut d'horloge de la tablette, et
 *  resterait figé sous l'horloge gelée de `outils/verifier-rendu.mjs`. */
import type { Etat } from './etat';

/** Un emplacement de minuteur : le helper `timer` et l'`input_text` qui porte son nom. Déclarés
 *  dans `pieces.ts`, jamais devinés à partir d'un motif d'`entity_id`. */
export type SlotMinuteur = { timer: string; nom: string };

export type VueMinuteur = {
  /** Indice dans la déclaration de la pièce — l'identité stable d'une ligne à l'écran. */
  slot: number;
  timer: string;
  nomEntite: string;
  /** Vide quand aucun nom n'est renseigné : la ligne affiche alors son numéro. */
  nom: string;
  /** `true` = en marche, `false` = en pause. Un minuteur au repos n'a pas de vue du tout. */
  actif: boolean;
  restantS: number;
};

export type AncreMinuteur = { restantS: number; ancreMs: number; fige: boolean };

export const PAS_MINUTEUR_S = 300;
export const MAX_MINUTEURS = 3;

const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

/** `H:MM:SS` (ce que HA publie dans `duration`/`remaining`) → secondes. Rend 0 sur une valeur
 *  inutilisable, jamais NaN : un NaN se propagerait jusqu'à l'écran en « NaN:NaN ». */
export function lireDureeHms(hms: string): number {
  const parts = String(hms).split(':').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function bornerDuree(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)));
}

/** Secondes → `HH:MM:SS`, le format attendu par `timer.start`. Point d'entrée public réutilisé
 *  par le câblage de l'ajustement « ± 5 » (tâche 7) : contrat explicite, jamais de `NaN` en
 *  sortie même sur une entrée invalide. */
export function hms(secondes: number): string {
  if (!Number.isFinite(secondes)) return '00:00:00';
  const t = Math.max(0, Math.round(secondes));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Minutes → `HH:MM:SS` : écrit sur `hms`, sans dupliquer le remplissage à deux chiffres. */
export function dureeHms(minutes: number): string {
  return hms(bornerDuree(minutes) * 60);
}

/** Le temps restant tel que HA le dit à cet instant. Un `active` porte `finishes_at` (instant
 *  absolu) ; un `paused` porte `remaining`. Un `active` SANS `finishes_at` (donnée manquante) se
 *  rabat sur sa `duration` : une ligne sans tic vaut mieux qu'une ligne disparue — le minuteur,
 *  lui, tourne bel et bien. */
function restantPublie(
  e: { etat: string; attributs: Record<string, unknown> }, maintenantMs: number,
): number {
  if (e.etat === 'active') {
    const fin = Date.parse(String(e.attributs['finishes_at'] ?? ''));
    if (Number.isFinite(fin)) return Math.max(0, (fin - maintenantMs) / 1000);
    return lireDureeHms(String(e.attributs['duration'] ?? ''));
  }
  return lireDureeHms(String(e.attributs['remaining'] ?? ''));
}

export function listerMinuteurs(
  etat: Etat, slots: SlotMinuteur[], maintenantMs: number,
): VueMinuteur[] {
  const vues: VueMinuteur[] = [];
  slots.forEach((s, slot) => {
    if (!etat.estUtilisable(s.timer)) return;          // absent, unavailable, unknown
    const e = etat.lire(s.timer)!;
    if (e.etat !== 'active' && e.etat !== 'paused') return;
    // Réutilise `estUtilisable` (centralise déjà unavailable/unknown/'') plutôt que de
    // recopier ces jetons dans un tableau littéral local.
    const nomEnt = etat.lire(s.nom);
    vues.push({
      slot, timer: s.timer, nomEntite: s.nom,
      nom: nomEnt && etat.estUtilisable(s.nom) ? nomEnt.etat : '',
      actif: e.etat === 'active',
      restantS: restantPublie(e, maintenantMs),
    });
  });
  // Les actifs d'abord (ce qui va sonner), chacun par échéance croissante ; les pausés ensuite,
  // eux aussi du plus court au plus long. Un pausé n'a pas d'échéance : le comparer à un actif
  // sur le temps restant mélangerait deux notions différentes.
  return vues.sort((a, b) => (Number(b.actif) - Number(a.actif)) || (a.restantS - b.restantS));
}

/** Le premier emplacement au repos, ou `null` s'il n'y en a plus. Un slot `unavailable` n'est
 *  jamais proposé : `timer.start` y échouerait sans rien dire à l'écran. */
export function premierSlotLibre(etat: Etat, slots: SlotMinuteur[]): number | null {
  for (let i = 0; i < slots.length && i < MAX_MINUTEURS; i++) {
    if (!etat.estUtilisable(slots[i].timer)) continue;
    if (etat.lire(slots[i].timer)!.etat === 'idle') return i;
  }
  return null;
}

/** `mm:ss`, ou `h:mm:ss` au-delà d'une heure. Arrondi vers le HAUT : à 0,4 s de la fin, l'écran
 *  affiche encore « 00:01 » — un minuteur qui affiche « 00:00 » pendant une seconde entière donne
 *  l'impression d'être mort avant de sonner. */
export function formaterRestant(secondes: number): string {
  const t = Math.max(0, Math.ceil(secondes));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Fige un point de départ : « à cet instant de l'horloge monotone, il restait tant ». */
export function ancrerMinuteur(v: VueMinuteur, horlogeMs: number): AncreMinuteur {
  return { restantS: v.restantS, ancreMs: horlogeMs, fige: !v.actif };
}

export function restantAncre(a: AncreMinuteur, horlogeMs: number): number {
  if (a.fige) return a.restantS;
  return Math.max(0, a.restantS - Math.max(0, (horlogeMs - a.ancreMs) / 1000));
}
