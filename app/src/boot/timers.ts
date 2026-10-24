/** The screen's LOCAL timers — everything that moves between two redraws without Home Assistant
 *  saying anything: the media progress rail, the timer countdowns and the waking of the night
 *  screen. Each works on the shared `ScreenState`; the intervals themselves are armed once only,
 *  by `wireScreen` (`boot/wiring.ts`). */
import { writeProgress } from '../rendu/media';
import { restantAncre, formaterRestant } from '../minuteur';
import { writeTime } from '../rendu/minuteur';
import { horlogeMonotone, RETOUR_MS } from './constants';
import type { ScreenState } from './state';

/** Moves the media card's progress forward between two redraws: the elapsed and remaining
 *  times, and the rail (`writeProgress`, `rendu/media.ts` — one anchor, one instant, so the text
 *  and the bar never disagree). Refusals, each taken from a lesson this project already paid for:
 *   - `document.hidden`: the tablet's screen is off at night. Writing every second until morning
 *     on a machine with 130 MB free paints nothing — same lesson as `mesurer` (`mouvement.ts`);
 *   - no `.media` on screen, no anchor, or playback paused: nothing to move forward;
 *   - `niveauInitial === 'aucun'` (the owner or `prefers-reduced-motion` asked that no animation
 *     play) stops the RAIL only. A running rail is an animation, and a frozen one says nothing
 *     false. The times are not an animation but the information itself — a frozen `−1:47` lies,
 *     the ruling of 2026-08-03 for the kitchen countdowns (`tictacMinuteurs` below) — so they
 *     keep moving, written into their text nodes like the countdowns (2026-10-24).
 *  Never a `lit` render: the next `dessiner()` rewrites the exact values anyway. */
export function tictacProgression(s: ScreenState) {
  if (typeof document !== 'undefined' && document.hidden) return;
  if (s.ancreProgression === null || !s.ancreProgression.avance) return;
  const carte = s.racine.querySelector<HTMLElement>('.media');
  if (!carte) return;
  writeProgress(carte, s.ancreProgression, horlogeMonotone(), s.niveauInitial !== 'aucun');
}

/** Makes the countdowns GO DOWN between two redraws — Home Assistant does not republish a timer
 *  second by second, it publishes a deadline. Only two refusals, not three: `document.hidden`
 *  (the tablet's screen is off at night, writing into a node nobody can see costs RAM and nothing
 *  else) and no anchor (nothing on screen). A frozen anchor (paused timer) is ignored by
 *  `restantAncre` itself.
 *
 *  ⚠️ INTENDED ASYMMETRY WITH `tictacProgression`, RULED BY THE OWNER ON 2026-08-03 — DO NOT
 *  "RESTORE CONSISTENCY" BY PUTTING `if (niveauInitial === 'aucun') return;` BACK HERE. The media
 *  rail keeps that refusal; the countdown does not. The reason is not technical, it is editorial:
 *  **a countdown is not a decoration, it is the information itself**. A frozen progress rail
 *  tells nobody anything false — the song moves on anyway, and the next `dessiner()` will put the
 *  rail back where it belongs. A frozen kitchen timer, for its part, LIES: it makes one believe
 *  there is time left. That is exactly the opposite of what one asks of a timer.
 *
 *  What the refusal cost, measured (intermittency diagnosis, 2026-08-03): under
 *  `?mouvement=aucun`/`prefers-reduced-motion`, the countdown was only rewritten by `dessiner()`,
 *  hence in jumps of 2 to 4 s when the house pushes states, and up to 20 s (the clock interval) in
 *  a quiet house at night — precisely when a kitchen timer is running. Task 8 (motion engine):
 *  `niveauInitial` no longer drops on its own along the way (it did before that task, through the
 *  former global `niveau`/`degrader` of `demarrage.ts`). Since task 1 of the grammar project, the
 *  regulator that still degraded PER ROLE in the engine has been removed too: the level is FIXED,
 *  decided once only at mount time by `niveauDemande` (`src/mouvement.ts`), nothing makes it drop
 *  along the way any more. The refusal that remains here is therefore only
 *  `prefers-reduced-motion`/`?mouvement=` set from start-up — but the countdown keeps going down
 *  even under that refusal (asymmetry above).
 *
 *  The cost of this tick when everything else is off stays bounded: one text node write per
 *  second and per displayed timer (three at most), without a `lit` render, without a layout
 *  recomputation — the order of magnitude of what the header clock already does.
 *
 *  Writes ONLY into the text node of the time (`writeTime`), never a `lit` render: the next
 *  `dessiner()` will rewrite the exact value anyway. An interval SEPARATE from
 *  `tictacProgression`, on purpose (see the arming comment in `boot/wiring.ts`): their refusals
 *  differ — it is even now their only substantial difference — and an absent media rail must not
 *  prevent a countdown from moving. */
export function tictacMinuteurs(s: ScreenState) {
  if (typeof document !== 'undefined' && document.hidden) return;
  if (s.ancresMinuteurs.size === 0) return;
  const horloge = horlogeMonotone();
  for (const [slot, ancre] of s.ancresMinuteurs) {
    const el = s.racine.querySelector<HTMLElement>(`.mn-temps[data-minuteur="${slot}"]`);
    if (!el) continue;                     // the block changed between two ticks: nothing to write
    writeTime(el, formaterRestant(restantAncre(ancre, horloge)));
  }
}

/** Wakes the night screen and arms (or re-arms) its return after `RETOUR_MS`, same pattern as one
 *  token per call, a single timer is authoritative (see `jetonClim`, `boot/controls.ts`). Without
 *  it, the very first touch would put the screen back to sleep 45 s later even if other touches
 *  happened since — in the middle of what someone is doing.
 *
 *  A module function rather than a local of `wireScreen` like `armerRetour`, because it is called
 *  by TWO consumers that do not share the same scope: `dessiner()` (which passes it to
 *  `rendreNuit`) and the re-arming listener set once by `wireScreen` (`boot/wiring.ts`).
 *
 *  Calls `dessiner()` only on the very first wake (`!etait`): the following touches, while the
 *  screen is already awake, only re-arm the delay — repainting on every touch would be rendering
 *  work with no visible change to produce. */
export function reveiller(s: ScreenState) {
  const etait = s.reveilNuit;
  s.reveilNuit = true;
  const mien = ++s.jetonReveil;
  s.d.minuteurFn(() => {
    if (mien !== s.jetonReveil) return;   // a more recent touch has already re-armed another token
    s.reveilNuit = false;
    s.dessiner();
  }, RETOUR_MS);
  if (!etait) s.dessiner();
}
