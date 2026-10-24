/** `dessiner()`: the single painter of a mounted screen, called back by the state, the clock,
 *  the weather and every gesture. It computes the frame (`boot/frame.ts`), sets what must be set
 *  BEFORE any early return (timer anchors, palette), then paints exactly one
 *  view: the night screen, one of the four sub-views (`boot/subviews.ts`) or the home view
 *  (`boot/home.ts`). */
import { html } from 'lit';
import type { Moment } from '../contexte';
import { rendreNuit } from '../rendu/nuit';
import { computeFrame } from './frame';
import { settlePin } from '../media-choice';
import { reveiller } from './timers';
import { paintSubView } from './subviews';
import { paintHome } from './home';
import type { ScreenState } from './state';

export function dessiner(s: ScreenState): void {
  const f = computeFrame(s);
  const { maintenant, moment, mode, media } = f;
  // `computeFrame` is pure: the pin is settled here, once per frame, on what it chose.
  s.pinnedMedia = settlePin(media, s.pinnedMedia);

  // The timer anchors are emptied HERE, before every early return (night, sub-views), and set
  // again only by the home view when the card it displays is a timer card (`afterStackPaint`,
  // `boot/home-stack.ts`). The same rule since task 7, carried by the displayed card instead of
  // the `minuteur` mode: a timer keeps running while the night screen, a sub-view, the alert, the
  // offline notice or another card of the stack is shown, and an anchor kept alive for a
  // countdown that is not on screen would be a map alive but WRONG — the tick would write into
  // whatever `.mn-temps` a later render puts there.
  s.ancresMinuteurs = new Map();

  // Task 7 (palette fade): `basculerPalette` replaces the two original `classList.toggle('sombre',
  // …)` (on `racine` AND on `<html>`, see task 20 in `startWithScreen`) — it is what sets
  // `.fondu-palette` for the duration of the crossing then removes it, and what keeps an internal
  // guard so as to redo nothing when the palette does not change (this function runs on every
  // burst of `state_changed` and every 20 s through the clock). The cinema mode forces the dark
  // palette even in broad daylight: the screen stops lighting the living room during a film.
  //
  // I4 (final review) — A SINGLE CALL, HERE. There were TWO, 129 lines apart and without a
  // `return` between them: `basculerPalette(moment !== 'jour')` at the very top of `dessiner()`,
  // then `basculerPalette(true)` in cinema mode. In daytime during a film, the engine's internal
  // current-palette guard therefore NEVER held: every redraw removed `.sombre` then put it back, set
  // `.fondu-palette` again on `<html>` and `#app` and armed two 600 ms timers. No visible flash
  // (both switches fall in the same JS task), but two style recomputations of the whole tree per
  // painting — and above all `.fondu-palette *` stayed armed most of the time, that is the
  // PERMANENT state its own comment in `base.css` forbids ("it would also cross every tile state
  // change").
  //
  // Placed BEFORE the early returns below: entering the whole house or the tasks during a film
  // must not light the screen up again in the middle of the showing. Since the card stack
  // (2026-10-24) there is no `cinema` mode left: the dark palette follows the fact itself, a
  // screen of this room is on, whichever card the stack displays — except under an alert, which
  // takes the screen as the cinema mode never could.
  s.moteur.basculerPalette(moment !== 'jour' || (f.ctx.ecranAllume && mode !== 'alerte'));

  // Task 8, correction round 1: the night (23:00 → 05:00, see `momentDuJour`) prevails over
  // EVERYTHING, including a touch already in progress on the whole house. First version: the hash
  // prevailed, on the idea that an explicit touch proved someone was already acting in front of
  // the screen. But nothing took over again if the hour switched *while* that view was open
  // (`dessiner()` is also called back every 20 s by the clock, without any touch having
  // happened): up to 45 s of a 9-tile grid on a light background in a room that has just switched
  // to the middle of the night — exactly what the night screen exists to avoid. The central use
  // case of this screen (someone crossing the living room in the middle of the night) therefore
  // prevails over the rarer one of someone already acting on the whole house at the precise
  // moment the hour switches. In practice the whole-house view only becomes reachable again in
  // the early morning (`moment !== 'nuit'`): its access button only lives on the normal screen
  // (`rendu/corps.ts`), never on the night screen, so no touch can reopen it anyway while the
  // night lasts.
  // Task 9, coordinator's feedback: the night screen receives `horsLigne` too — the `.muet`
  // greying alone (set on `racine` by the silence watch, universal) is not enough there, see the
  // docstring of `rendreNuit`.
  //
  // Task 9 (wake): `!reveilNuit` on top of `moment === 'nuit'` — a woken screen skips this early
  // return and falls into the normal render below (header + body), in the evening palette
  // (`momentRendu`, just after this block). `reveiller` is passed ONLY in this branch (the night
  // screen is the only one that uses it): when the screen is woken, `rendreNuit` is no longer
  // rendered at all, so nothing needs to pass it this callback again.
  if (moment === 'nuit' && !s.reveilNuit) {
    s.moteur.peindre(html`${rendreNuit(s.etat, maintenant, s.piece, s.horsLigne, () => reveiller(s))}`);
    return;
  }
  // Task 9 (wake): the woken screen presents itself as an EVENING screen, never a NIGHT one, in
  // the sense of what `boot/` passes downstream — `momentDuJour` (`contexte.ts`) stays pure and
  // knows nothing of this wake: it is here, in what the RENDER receives, that the night becomes
  // an evening, never in the time rule itself. If the hour leaves the night range by itself while
  // the screen is awake, this `momentRendu` becomes equal to `moment` again on its own (the
  // condition is false): nothing special to do, the next render is already that of the real day
  // or evening.
  //
  // Correction round 1 (coordinator's review): without any OBSERVABLE effect today — corrected
  // here so as to stop claiming it wrongly. `rendreBandeau` (`rendu/bandeau.ts`) declares a
  // `moment` parameter it never reads in its body (pre-existing, outside the scope of that task,
  // flagged in the report): passing it `'soir'` rather than `'nuit'` therefore changes nothing
  // in what the header displays. The intended visual result (dark palette) is already reached
  // through another path, `.sombre` (`moment !== 'jour'`, identically true for `'nuit'` and
  // `'soir'`). `momentRendu` remains set and passed on: it is the semantically right value to
  // give `rendreBandeau`, and the day its `moment` parameter is actually read, this wiring will
  // not need to be revisited.
  const momentRendu: Moment = moment === 'nuit' && s.reveilNuit ? 'soir' : moment;
  if (paintSubView(s, f)) return;
  paintHome(s, f, momentRendu);
}
