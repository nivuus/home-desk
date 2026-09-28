/** Full-screen animations pushed by Home Assistant (`home_desk.jouer_animation`, relayed to this
 *  screen by the `home_desk/animations` subscription). This module is the PURE part: reading the
 *  wire payload, the effective duration, and the "which animation is current" state with its
 *  token. Nothing here renders, arms a timer or listens to an event — that is `boot/animation.ts`
 *  (wiring) and `rendu/animation.ts` (the overlay).
 *
 *  An animation ends at the FIRST of: its natural end (`ended` of a video), its `duree`, the
 *  120 s cap, the first touch, or a load failure. There is never a black screen without an end:
 *  the cap is always armed, whatever the type. */

export type TypeAnimation = 'video' | 'image' | 'lottie';
export type FondAnimation = 'noir' | 'transparent';

/** The wire payload of one `home_desk/animations` event, as the component sends it
 *  (`animations.py`): `duree` is in milliseconds, `null` meaning "play once to its end". */
export type Animation = {
  url: string;
  type: TypeAnimation;
  duree: number | null;
  fond: FondAnimation;
};

/** The cap every animation obeys, whatever its type or its `duree` (the service refuses more than
 *  120 s; the tablet enforces it again, so that a video or a Lottie without `duree` that never
 *  ends cannot hold the wall). */
export const DUREE_MAX_MS = 120_000;

const TYPES: readonly TypeAnimation[] = ['video', 'image', 'lottie'];
const FONDS: readonly FondAnimation[] = ['noir', 'transparent'];

/** Reads an event of the subscription. Returns `null` for anything that is not exactly the
 *  component's payload: a malformed event is refused here rather than half-played. */
export function lireAnimation(evt: Record<string, unknown>): Animation | null {
  const { url, type, duree, fond } = evt;
  if (typeof url !== 'string' || url === '') return null;
  if (!TYPES.includes(type as TypeAnimation)) return null;
  if (!FONDS.includes(fond as FondAnimation)) return null;
  if (duree !== null && !(typeof duree === 'number' && Number.isFinite(duree) && duree > 0)) {
    return null;
  }
  return { url, type: type as TypeAnimation, duree, fond: fond as FondAnimation };
}

/** How long the overlay may stay at most: its `duree` when it has one, never more than the cap. */
export function dureeEffective(a: Animation): number {
  return Math.min(a.duree ?? DUREE_MAX_MS, DUREE_MAX_MS);
}

/** The animation on screen, tagged with the token it was started under. */
export type AnimationEnCours = { animation: Animation; jeton: number };

/** What the two transitions below need from the screen state (`ScreenState` satisfies it). */
export type EtatAnimation = {
  animation: AnimationEnCours | null;
  jetonAnimation: number;
};

/** Starts `a`, REPLACING whatever was playing (no queue). Returns the new token: every closer of
 *  this animation (end, error, timer, touch) must carry it, so that the closers of a replaced
 *  animation, still pending, cannot close its successor. */
export function jouerAnimation(s: EtatAnimation, a: Animation): number {
  const jeton = ++s.jetonAnimation;
  s.animation = { animation: a, jeton };
  return jeton;
}

/** Closes the animation started under `jeton`. Does nothing, and says so (`false`), when that
 *  token is stale — another animation has replaced it — or when nothing is playing. */
export function fermerAnimation(s: EtatAnimation, jeton: number): boolean {
  if (s.animation === null || s.animation.jeton !== jeton) return false;
  s.animation = null;
  return true;
}
