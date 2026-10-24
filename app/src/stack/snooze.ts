/** "Plus tard": a card hidden on every tablet for two hours. The set lives in the integration
 *  (`custom_components/home_desk/plus_tard.py`), never in this browser: a tablet sends the key and
 *  follows the set the integration pushes back, its own press included. */
import type { ConnexionLike } from '../boot/types';

/** The integration's two commands, written on both sides like `home_desk/abonner`: on the Python
 *  side they are computed (`const.WS_PLUS_TARD`, `const.WS_PLUS_TARD_ABONNER`). */
const SNOOZE = 'home_desk/plus_tard';
const SUBSCRIPTION = 'home_desk/plus_tard/abonner';

export function snoozeCard(cx: Pick<ConnexionLike, 'envoyerCommande'>, key: string): Promise<void> {
  return cx.envoyerCommande({ type: SNOOZE, cle: key }).then(() => undefined);
}

/** Follows the active set: `onChange` receives the snoozed keys on subscription, on every
 *  change and at every expiry. Called once for the lifetime of the page (`wireScreen`):
 *  `Connexion.abonner` replays the subscription on every reconnection, so there is nothing to
 *  undo and no unsubscribe to hand back. */
export function subscribeSnoozes(
  cx: Pick<ConnexionLike, 'abonner'>, onChange: (keys: Set<string>) => void,
): void {
  cx.abonner({ type: SUBSCRIPTION }, (active) => {
    // `{key: end}`, the end in UTC ISO 8601; the tablet needs the keys only, the expiry is pushed.
    if (!Object.values(active).every((end) => typeof end === 'string')) {
      console.error('home-desk: malformed snooze set ignored', active);
      return;
    }
    onChange(new Set(Object.keys(active)));
  });
}
