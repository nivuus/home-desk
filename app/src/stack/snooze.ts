/** "Plus tard": a card hidden on every tablet for two hours. The set lives in the integration
 *  (`custom_components/home_desk/plus_tard.py`), never in this browser: a tablet sends the key and
 *  follows the set the integration pushes back, its own press included. */
import type { ConnexionLike } from '../boot/types';

/** The integration's two commands, written on both sides like `home_desk/abonner`: on the Python
 *  side they are computed (`const.WS_PLUS_TARD`, `const.WS_PLUS_TARD_ABONNER`). */
const SNOOZE = 'home_desk/plus_tard';
const SUBSCRIPTION = 'home_desk/plus_tard/abonner';
/** `setTimeout` fires at once past this delay; a longer wait is taken in steps. */
const MAX_DELAY_MS = 2 ** 31 - 1;

export type SnoozeClock = { now: () => number; minuteurFn: typeof setTimeout };

export function snoozeCard(cx: Pick<ConnexionLike, 'envoyerCommande'>, key: string): Promise<void> {
  return cx.envoyerCommande({ type: SNOOZE, cle: key }).then(() => undefined);
}

/** Follows the active set: `onChange` receives the snoozed keys on subscription, on every
 *  change, and when a key ends. The integration pushes its expiries, but the tablet also drops a
 *  key at its end on its own clock: a refused or silent subscription would otherwise keep a card
 *  hidden for as long as the socket lives. A push replaces the whole set.
 *
 *  Called once for the lifetime of the page (`wireScreen`): `Connexion.abonner` replays the
 *  subscription on every reconnection, so there is nothing to undo and no unsubscribe to hand
 *  back. */
export function subscribeSnoozes(
  cx: Pick<ConnexionLike, 'abonner'>, onChange: (keys: Set<string>) => void, clock: SnoozeClock,
): void {
  let ends = new Map<string, number>();
  // Only the latest timer acts: a replaced one fires as a no-op (`minuteurFn` comes without its
  // `clearTimeout`, like everywhere in `boot/`).
  let token = 0;

  const arm = () => {
    const mine = ++token;
    if (ends.size === 0) return;
    const soonest = Math.min(...ends.values());
    clock.minuteurFn(() => {
      if (mine !== token) return;
      const now = clock.now();
      const kept = new Map([...ends].filter(([, end]) => end > now));
      if (kept.size !== ends.size) {
        ends = kept;
        onChange(new Set(ends.keys()));
      }
      arm();
    }, Math.min(Math.max(soonest - clock.now(), 0), MAX_DELAY_MS));
  };

  cx.abonner({ type: SUBSCRIPTION }, (active) => {
    // `{key: end}`, the end in UTC ISO 8601.
    const parsed = Object.entries(active).map(([key, end]) =>
      [key, typeof end === 'string' ? Date.parse(end) : NaN] as const);
    if (parsed.some(([, end]) => Number.isNaN(end))) {
      console.error('home-desk: malformed snooze set ignored', active);
      return;
    }
    ends = new Map(parsed);
    onChange(new Set(ends.keys()));
    arm();
  });
}
