/** Content that changes inside a box: a block replaced by another one (`croisement`), the media
 *  card on a new track, a command tile that changes state (`mutation`). Moved out of `moteur.ts`
 *  on 2026-11-06, which had grown past the 500-line limit: that file decides WHICH gesture a
 *  verdict plays, this one plays the gestures that swap one content for another.
 *
 *  Two gestures, chosen on the boxes alone:
 *  - the SAME box (same place, same size): a crossfade. The old content's ghost dissolves OVER the
 *    new one, which stays opaque underneath. Fading the new one in at the same time, as the engine
 *    did until then, left both half transparent at mid-course: the page showed through the card,
 *    which read as a pale flash.
 *  - a box that changes: MD3's fade through. The old content leaves first (`FONDU_SORTANT_MS`),
 *    then the new one comes in (`FONDU_ENTRANT_MS`). Crossed at the same time, a 150 px card over a
 *    50 px alert printed "85 %" over "Porte déverrouillée", and the ghost covered the summary line
 *    that was already sliding up into the freed space. */
import {
  AFFICHE_ATTENTE_MAX_MS, CROISEMENT_MS, EFFET, EFFET_SORTIE, FONDU_ENTRANT_MS, FONDU_SORTANT_MS,
  GARDE_MS,
} from './grammaire';
import type { Calque } from './fantomes';
import type { Marque } from './marques';

/** The subset of `Animation` the engine needs (declared in `moteur.ts`'s terms, without the DOM
 *  lib: jsdom implements no animation, the tests provide a double). */
export type AnimationLike = { finished: Promise<unknown>; cancel: () => void };
export type Animer =
  (el: HTMLElement, trames: Keyframe[], options: KeyframeAnimationOptions) => AnimationLike;

export type OutilsCroisement = {
  calque: Calque;
  animer: Animer;
  minuteurFn: (cb: () => void, ms: number) => number;
  decoder: (img: HTMLImageElement) => Promise<void>;
};

/** Same place and same size, to the pixel (layout values are not always integers). */
export function memeBoite(a: Marque, b: Marque): boolean {
  const pres = (x: number, y: number) => Math.abs(x - y) <= 1;
  return pres(a.position[0], b.position[0]) && pres(a.position[1], b.position[1])
    && pres(a.taille[0], b.taille[0]) && pres(a.taille[1], b.taille[1]);
}

/** Round of correction 1 — the URL of a `background-image: url(...)`, set by the card frame
 *  (`rendu/card-frame.ts`) on `.carte-image`. The media card never puts an `<img>` in its flow:
 *  this is the ONLY way to know whether a poster exists and where to preload it. The browser
 *  always normalises the property to `url("…")`; only the quotes are removed. */
export function urlAffiche(bloc: HTMLElement): string | null {
  const affiche = bloc.querySelector<HTMLElement>('.carte-image');
  const valeur = affiche?.style.backgroundImage;
  if (!valeur) return null;
  const m = /^url\((['"]?)([\s\S]*)\1\)$/.exec(valeur.trim());
  return m ? m[2] : null;
}

/** The change waits on the FIRST of its two causes — poster decoded or `AFFICHE_ATTENTE_MAX_MS`
 *  reached — and never runs twice. */
function uneSeuleFois(f: () => void): () => void {
  let fait = false;
  return () => { if (!fait) { fait = true; f(); } };
}

/** What a media card waiting for its poster holds on screen. */
type Attente = { generation: number; fantome: HTMLElement | null; masque: AnimationLike | null };

export function creerCroiseur(o: OutilsCroisement) {
  const { calque, animer, minuteurFn } = o;
  const attentes = new Map<string, Attente>();
  let generation = 0;

  /** `easing`: a crossfade dissolves from its first frame (`EFFET`) — an accelerating curve held
   *  the old tile still for ~80 ms, which read as lag; a fade through's short exit accelerates. */
  function dissoudre(f: HTMLElement, duree: number, easing: string): void {
    const a = animer(f, [{ opacity: 1 }, { opacity: 0 }],
      { duration: duree, easing, fill: 'forwards' });
    a.finished.finally(() => calque.relacher(f)).catch(() => {});
    // `finished` never settles when the screen goes off mid-flight.
    minuteurFn(() => calque.relacher(f), duree + GARDE_MS);
  }

  /** Plays the swap from the ghost `f` (the old content, on screen and opaque) to `el` (the new
   *  content, already rendered by `lit`). */
  function finir(f: HTMLElement | null, el: HTMLElement, meme: boolean): void {
    if (meme) {
      if (f !== null) dissoudre(f, CROISEMENT_MS, EFFET);
      return;
    }
    if (f !== null) dissoudre(f, FONDU_SORTANT_MS, EFFET_SORTIE);
    animer(el, [{ opacity: 0 }, { opacity: 1 }], {
      duration: FONDU_ENTRANT_MS, delay: f === null ? 0 : FONDU_SORTANT_MS,
      easing: EFFET, fill: 'backwards',
    });
  }

  /** A swap played at once. `ancienne` must carry the old content: a mark of the survey BEFORE
   *  the painting, with its `copie` when `lit` rewrites the node in place. */
  function changer(ancienne: Marque | undefined, nouvelle: Marque): void {
    const f = ancienne ? calque.fantomer(ancienne) : null;
    finir(f, nouvelle.el, ancienne !== undefined && memeBoite(ancienne, nouvelle));
  }

  /** The media card on a new track. Its new poster may still be loading: crossing towards it
   *  would show a flat tint, then the image popping in a second later. The OLD card's ghost
   *  therefore holds the screen, opaque, until the poster is decoded (capped at
   *  `AFFICHE_ATTENTE_MAX_MS`). Until 2026-11-06 the NEW card was masked instead, with no ghost
   *  yet — the slot stayed empty for as long as the poster took.
   *
   *  A newer track while the previous one still waits: the ghost already on screen is what the wall
   *  shows, so it keeps holding, and only the newest track is ever crossed to. */
  function changerApresAffiche(ancienne: Marque | undefined, nouvelle: Marque): void {
    const cle = `${nouvelle.role}:${nouvelle.cle}`;
    const el = nouvelle.el;
    const precedente = attentes.get(cle);
    const gen = ++generation;
    precedente?.masque?.cancel();
    const f = precedente?.fantome ?? (ancienne ? calque.fantomer(ancienne) : null);
    const meme = ancienne !== undefined && memeBoite(ancienne, nouvelle);
    const url = urlAffiche(el);
    if (url === null) {
      attentes.delete(cle);
      finir(f, el, meme);
      return;
    }
    // A crossfade already has the new card under the opaque ghost; a fade through must keep it
    // hidden until its turn. An animation, not `style.opacity`: `lit` owns the `style` attribute
    // of the card and rewrites it at every painting.
    const masque = meme || f === null ? null : animer(el, [{ opacity: 0 }, { opacity: 0 }],
      { duration: AFFICHE_ATTENTE_MAX_MS + GARDE_MS, fill: 'both' });
    attentes.set(cle, { generation: gen, fantome: f, masque });
    if (f !== null) {
      // Safety net: never a ghost left over a card whose crossing never started.
      minuteurFn(() => {
        if (attentes.get(cle)?.fantome === f) return;   // still held by a newer track
        calque.relacher(f);
      }, AFFICHE_ATTENTE_MAX_MS + CROISEMENT_MS + GARDE_MS);
    }
    const partir = uneSeuleFois(() => {
      if (attentes.get(cle)?.generation !== gen) return;   // stale: a newer track took over
      attentes.delete(cle);
      masque?.cancel();
      finir(f, el, meme);
    });
    const precharge = new Image();
    precharge.src = url;
    o.decoder(precharge).then(partir, partir);
    minuteurFn(partir, AFFICHE_ATTENTE_MAX_MS);
  }

  return { changer, changerApresAffiche };
}
