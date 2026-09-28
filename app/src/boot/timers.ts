/** The screen's LOCAL timers — everything that moves between two redraws without Home Assistant
 *  saying anything: the media progress rail, the timer countdowns, the waking of the night screen
 *  and the DeLorean overlay. Each works on the shared `ScreenState`; the intervals themselves are
 *  armed once only, by `wireScreen` (`boot/wiring.ts`), except the DeLorean speedometer, whose
 *  instant does not exist yet at start-up (see `armerDelorean`). */
import { fractionAncree } from '../progression';
import { restantAncre, formaterRestant } from '../minuteur';
import { writeTime } from '../rendu/minuteur';
import { varianteDelorean, vitesseDelorean, DUREES_DELOREAN } from '../rendu/delorean';
import { horlogeMonotone, CADENCE_COMPTEUR_MS, RETOUR_MS } from './constants';
import type { ScreenState } from './state';

/** Moves the media progress rail forward between two redraws. Three refusals, each taken from a
 *  lesson this project already paid for:
 *   - `niveauInitial === 'aucun'`: the owner (or `prefers-reduced-motion`) asked that no animation
 *     play. A running rail IS an animation — and a frozen rail says nothing false: the song moves
 *     on anyway, the next `dessiner()` will put it back in place. ⚠️ This refusal applies ONLY to
 *     the rail: `tictacMinuteurs` no longer shares it since the ruling of 2026-08-03 (a frozen
 *     countdown, for its part, LIES). Intended asymmetry, explained in detail on
 *     `tictacMinuteurs` just below;
 *   - `document.hidden`: the tablet's screen is off at night. Writing a CSS variable every second
 *     until morning on a machine with 130 MB free paints nothing — same lesson as `mesurer`
 *     (`mouvement.ts`) and, since this review, as `deplacer`;
 *   - no `.media` on screen, no anchor, or playback paused: nothing to move forward.
 *  Writes ONLY `--progression`, never a `lit` render: the next `dessiner()` will rewrite the whole
 *  `style` attribute anyway, with the right value — same mechanism, and same assumed coexistence,
 *  as the optimistic feedback of `--niveau` (`rendu/media.ts`). */
export function tictacProgression(s: ScreenState) {
  if (s.niveauInitial === 'aucun') return;
  if (typeof document !== 'undefined' && document.hidden) return;
  if (s.ancreProgression === null || !s.ancreProgression.avance) return;
  const carte = s.racine.querySelector<HTMLElement>('.media');
  if (!carte) return;
  carte.style.setProperty('--progression', String(fractionAncree(s.ancreProgression, horlogeMonotone())));
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

/** Cuts the scene in progress. Called by the end timer, and by the FIRST TOUCH on the screen
 *  (owner's decision, 2026-08-21): the veil hides the panel for four to eight seconds, and one
 *  must never have to aim blindly. Cuts ONLY the overlay — the event is neither stopped nor
 *  cancelled, it goes on to the control underneath, which runs normally. `deloreanArme` is NOT
 *  reset to false: without it, the scene would re-arm on the next redraw, and the instant lasts
 *  a whole minute. */
export function couperDelorean(s: ScreenState) {
  if (s.sceneDelorean === null) return;
  s.sceneDelorean = null;
  s.dessiner();
}

/** The DeLorean overlay is armed from `dessiner()`, never under the `initialise` guard: its
 *  instant does not exist yet at start-up. The timer is therefore set from `dessiner()`, which
 *  the rest of `boot/` forbids itself — hence the `deloreanArme` lock, which guarantees at most ONE
 *  live timer per instant, however many redraws happen during the minute it lasts. */
export function armerDelorean(s: ScreenState, delorean: boolean, maintenant: Date) {
  if (delorean && !s.deloreanArme) {
    s.deloreanArme = true;
    s.sceneDelorean = varianteDelorean(maintenant);
    s.vitesseAffichee = 0;
    const duree = s.sceneDelorean ? DUREES_DELOREAN[s.sceneDelorean] : 0;
    s.d.minuteurFn(() => { couperDelorean(s); }, duree);
    // The speedometer only climbs in the `voyage` scene: anywhere else, this tick would have
    // nothing to move forward and would redraw the screen for nothing.
    if (s.sceneDelorean === 'voyage') {
      const depart = Date.now();
      const tic = s.d.intervalFn(() => {
        if (s.sceneDelorean !== 'voyage') { clearInterval(tic); return; }
        const v = vitesseDelorean(Date.now() - depart);
        if (v === s.vitesseAffichee) return;   // 88 reached: nothing left to repaint
        s.vitesseAffichee = v;
        s.dessiner();
      }, CADENCE_COMPTEUR_MS);
    }
  } else if (!delorean) {
    s.deloreanArme = false;
  }
}
