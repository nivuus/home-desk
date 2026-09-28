/** `dessiner()`: the single painter of a mounted screen, called back by the state, the clock,
 *  the weather and every gesture. It computes the frame (`boot/frame.ts`), sets what must be set
 *  BEFORE any early return (timer anchors, palette), then paints exactly one
 *  view: the night screen, one of the four sub-views (`boot/subviews.ts`) or the home view
 *  (`boot/home.ts`) — each with the animation overlay over it. */
import { html } from 'lit';
import type { Moment } from '../contexte';
import { ancrerMinuteur } from '../minuteur';
import { rendreNuit } from '../rendu/nuit';
import { horlogeMonotone } from './constants';
import { computeFrame } from './frame';
import { reveiller } from './timers';
import { calqueAnimation } from './animation';
import { paintSubView } from './subviews';
import { paintHome } from './home';
import type { ScreenState } from './state';

export function dessiner(s: ScreenState): void {
  const f = computeFrame(s);
  const { maintenant, moment, mode, sources, vuesMinuteurs } = f;

  // Correction round 1 (coordinator's review): set HERE, before the early returns (night, whole
  // house, tasks, and since task 10 bis `#minuteur` — see below), NOT after `blocCentral`. An
  // assignment placed after those `return`s would never run on those paths: the timer block
  // would disappear from the DOM (night, sub-view) but `ancresMinuteurs` would indefinitely keep
  // the map of its last "normal" render. The media rail (`ancreProgression`, `boot/home.ts`) has
  // the same position defect but only gets away with it because its tick checks
  // `querySelector('.media')` before writing; nothing guarantees that the task 8 tick will do the
  // same defensive check for the timers — that is precisely the guarantee this task must
  // deliver, not a chance to hope for later.
  //
  // `mode === 'minuteur'` IS NOT ENOUGH on its own: it only depends on `ctx` (hence on the state
  // of HA), not on the view actually displayed — a timer may very well keep running while one is
  // on the whole house, on the tasks, on the full-screen setting (`#minuteur`), or in the middle
  // of the night (`moment`, `location.hash` are independent of `mode`). Without repeating it
  // here, this boolean would stay true on those routes although the timer block is never rendered
  // there (see the early returns below): exactly the same class of error as the one fixed by this
  // move, just inverted (a map alive but WRONG rather than FROZEN). `horsLigne`/`mode`/`moment`
  // are already final at this point (any taking over by HA happened before `ctx`, above): no
  // dependency on `blocCentral`, which does not need to exist yet.
  //
  // Task 9 (wake): `moment !== 'nuit'` alone is no longer enough. A WOKEN night screen
  // (`reveilNuit`) renders the normal central block (see the early return of the night below,
  // conditioned on `!reveilNuit`) while `moment` still literally stays `'nuit'` as long as the
  // hour has not left the 23:00 → 05:00 range by itself. Without the `|| reveilNuit` here, a
  // running timer on a woken screen would end up with a displayed map but empty anchors: the
  // `.minuteurs` block exists in the DOM, but `tictacMinuteurs` no longer finds anything to count
  // down (`ancresMinuteurs.size === 0` cuts short, see its comment) — a frozen countdown,
  // silently, exactly the class of error this comment describes just above for the original
  // version of the bug.
  //
  // Task 10 bis: `!reglageMinuteur` (removed along with the local state) is replaced by
  // `location.hash !== '#minuteur'` — exactly the same role, carried by the hash like the other two
  // sub-views. It is also the answer to "does the countdown keep going down when leaving the
  // sub-view?": on leaving `#minuteur` (hash reset to `''`), this condition becomes true again and
  // `ancresMinuteurs` is recomputed on the next `dessiner()`, exactly as when coming back from
  // `#maison`/`#taches`.
  const minuteursAffiches = !s.horsLigne && mode === 'minuteur'
    && (moment !== 'nuit' || s.reveilNuit) && location.hash !== '#maison'
    && location.hash !== '#taches' && location.hash !== '#minuteur'
    && location.hash !== '#garde-manger';
  s.ancresMinuteurs = new Map(minuteursAffiches
    ? vuesMinuteurs.map((v) => [v.slot, ancrerMinuteur(v, horlogeMonotone())])
    : []);

  // THE displayed source, chosen by the MODE and not by its position in the list (task 12
  // review). `paused` counts as "playing" (`ETATS_ACTIFS`, `media.ts`) and "Music" is declared
  // before "Television": a YouTube Music session left paused the day before therefore confiscated
  // the card during a film — dark screen, cinema controls, and the last track listened to as the
  // title. In cinema mode, it is the source whose SCREEN is on that is right; everywhere else, the
  // first one that actually plays, in the declared order of exclusivity (in the living room: the
  // music before the TV, as surveyed on the old setup).
  const source = (mode === 'cinema' ? sources.find((x) => x.allumee) : sources.find((x) => x.joue))
    ?? null;

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
  // Placed AFTER the computation of `mode` (nothing between the two original points depended on
  // it) and BEFORE the early returns below: entering the whole house or the tasks during a film
  // must not light the screen up again in the middle of the showing.
  s.moteur.basculerPalette(moment !== 'jour' || mode === 'cinema');

  // The animation pushed by Home Assistant goes OVER any view, night screen included: the
  // automation decides the hour, and the night is when the house plays its scenes. Always a
  // descendant of `#app`, never `document.body`: the Material 3 colour tokens descend from there
  // (`.m3`, `jetons.css`), and the first-touch cut listens on `#app` in capture. Reduced motion
  // never reaches here: `boot/animation.ts` does not even start an animation at `aucun`.
  const survol = () => calqueAnimation(s);

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
    s.moteur.peindre(html`${rendreNuit(s.etat, maintenant, s.piece, s.horsLigne, () => reveiller(s))}${survol()}`);
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
  if (paintSubView(s, f, survol)) return;
  paintHome(s, f, source, momentRendu, survol);
}
