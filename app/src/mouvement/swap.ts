/** Content that changes inside a box: a block replaced by another one (`croisement` verdict), the
 *  media card on a new track, a command tile that changes state (`mutation` verdict). Moved out of
 *  `moteur.ts` on 2026-11-06, which had grown past the 500-line limit: that file decides WHICH
 *  gesture a verdict plays, this one plays the gestures that swap one content for another.
 *
 *  Two gestures, chosen on the boxes alone:
 *  - the SAME box (same place, same size): a crossfade. The old content's ghost dissolves OVER the
 *    new one, which stays opaque underneath. Fading the new one in at the same time, as the engine
 *    did until then, left both half transparent at mid-course: the page showed through the card,
 *    which read as a pale flash.
 *  - a box that changes: MD3's fade through. The old content leaves first (`FADE_OUT_MS`), then
 *    the new one comes in (`FADE_IN_MS`). Crossed at the same time, a 150 px card over a 50 px
 *    alert printed one text over the other, and the ghost covered the summary line that was
 *    already sliding up into the freed space.
 *
 *  The engine's survey type and its timing tokens predate the rule that code is written in English;
 *  the lines that must name them carry the policy marker. */
import {
  AFFICHE_ATTENTE_MAX_MS as POSTER_WAIT_MAX_MS, CROISEMENT_MS as CROSSFADE_MS,  // policy: allow-fr
  EFFET as STANDARD_EASING, EFFET_SORTIE as EXIT_EASING, GARDE_MS as GUARD_MS,
  FADE_IN_MS, FADE_OUT_MS,
} from './grammaire';
import type { Calque as GhostLayer } from './fantomes';
import type { Marque as Mark } from './marques';

/** The subset of `Animation` the engine needs (jsdom implements no animation: the tests provide a
 *  double). */
export type AnimationLike = { finished: Promise<unknown>; cancel: () => void };
export type Animate =
  (el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => AnimationLike;

export type SwapTools = {
  layer: GhostLayer;
  animate: Animate;
  timer: (cb: () => void, ms: number) => number;
  decode: (img: HTMLImageElement) => Promise<void>;
};

type Box = { at: readonly [number, number]; size: readonly [number, number] };
const boxOf = (m: Mark): Box => ({ at: m.position, size: m.taille });  // policy: allow-fr

/** Same place and same size, to the pixel (layout values are not always integers). */
export function sameBox(a: Mark, b: Mark): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) <= 1;
  const p = boxOf(a), q = boxOf(b);
  return near(p.at[0], q.at[0]) && near(p.at[1], q.at[1])
    && near(p.size[0], q.size[0]) && near(p.size[1], q.size[1]);
}

/** The URL of the `background-image: url(...)` the card frame (`rendu/card-frame.ts`) sets on
 *  `.carte-image`. The media card never puts an `<img>` in its flow: this is the ONLY way to know
 *  whether a poster exists and where to preload it. The browser always normalises the property to
 *  `url("…")`; only the quotes are removed. */
export function posterUrl(block: HTMLElement): string | null {
  const poster = block.querySelector<HTMLElement>('.carte-image');
  const value = poster?.style.backgroundImage;
  if (!value) return null;
  const m = /^url\((['"]?)([\s\S]*)\1\)$/.exec(value.trim());
  return m ? m[2] : null;
}

/** Runs `f` on the FIRST of its causes — poster decoded or `POSTER_WAIT_MAX_MS` reached — and
 *  never twice. */
function once(f: () => void): () => void {
  let done = false;
  return () => { if (!done) { done = true; f(); } };
}

/** What a media card waiting for its poster holds on screen. */
type Pending = { generation: number; ghost: HTMLElement | null; mask: AnimationLike | null };

export function createSwapper(t: SwapTools) {
  const { layer, animate, timer } = t;
  const pending = new Map<string, Pending>();
  let generation = 0;

  /** `easing`: a crossfade dissolves from its first frame (an accelerating curve held the old tile
   *  still for ~80 ms, which read as lag); a fade through's short exit accelerates. */
  function dissolve(ghost: HTMLElement, duration: number, easing: string): void {
    const a = animate(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: 'forwards' });
    a.finished.finally(() => layer.relacher(ghost)).catch(() => {});
    // `finished` never settles when the screen goes off mid-flight.
    timer(() => layer.relacher(ghost), duration + GUARD_MS);
  }

  /** Plays the swap from `ghost` (the old content, on screen and opaque) to `el` (the new content,
   *  already rendered by `lit`). */
  function finish(ghost: HTMLElement | null, el: HTMLElement, same: boolean): void {
    if (same) {
      if (ghost !== null) dissolve(ghost, CROSSFADE_MS, STANDARD_EASING);
      return;
    }
    if (ghost !== null) dissolve(ghost, FADE_OUT_MS, EXIT_EASING);
    animate(el, [{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_IN_MS, delay: ghost === null ? 0 : FADE_OUT_MS,
      easing: STANDARD_EASING, fill: 'backwards',
    });
  }

  const ghostOf = (m: Mark | undefined) => (m ? layer.fantomer(m) : null);

  /** A swap played at once. `before` must carry the old content: a mark of the survey taken
   *  BEFORE the painting, with its frozen copy when `lit` rewrites the node in place. */
  function swap(before: Mark | undefined, after: Mark): void {
    finish(ghostOf(before), after.el, before !== undefined && sameBox(before, after));
  }

  /** The media card on a new track. Its new poster may still be loading: crossing towards it would
   *  show a flat tint, then the image popping in a second later. The OLD card's ghost therefore
   *  holds the screen, opaque, until the poster is decoded (capped at `POSTER_WAIT_MAX_MS`). Until
   *  2026-11-06 the NEW card was masked instead, with no ghost yet: the slot stayed empty for as
   *  long as the poster took.
   *
   *  A newer track while the previous one still waits: the ghost already on screen is what the
   *  wall shows, so it keeps holding, and only the newest track is ever crossed to. */
  function swapAfterPoster(before: Mark | undefined, after: Mark): void {
    const key = after.el.dataset.mvt ?? '';
    const el = after.el;
    const previous = pending.get(key);
    const mine = ++generation;
    previous?.mask?.cancel();
    const ghost = previous?.ghost ?? ghostOf(before);
    const same = before !== undefined && sameBox(before, after);
    const url = posterUrl(el);
    if (url === null) {
      pending.delete(key);
      finish(ghost, el, same);
      return;
    }
    // A crossfade already has the new card under the opaque ghost; a fade through must keep it
    // hidden until its turn. An animation, not `style.opacity`: `lit` owns the `style` attribute
    // of the card and rewrites it at every painting.
    const mask = same || ghost === null ? null : animate(el, [{ opacity: 0 }, { opacity: 0 }],
      { duration: POSTER_WAIT_MAX_MS + GUARD_MS, fill: 'both' });
    pending.set(key, { generation: mine, ghost, mask });
    if (ghost !== null) {
      // Safety net: never a ghost left over a card whose crossing never started.
      timer(() => {
        if (pending.get(key)?.ghost === ghost) return;   // still held by a newer track
        layer.relacher(ghost);
      }, POSTER_WAIT_MAX_MS + CROSSFADE_MS + GUARD_MS);
    }
    const go = once(() => {
      if (pending.get(key)?.generation !== mine) return;   // stale: a newer track took over
      pending.delete(key);
      mask?.cancel();
      finish(ghost, el, same);
    });
    const preload = new Image();
    preload.src = url;
    t.decode(preload).then(go, go);
    timer(go, POSTER_WAIT_MAX_MS);
  }

  return { swap, swapAfterPoster };
}
