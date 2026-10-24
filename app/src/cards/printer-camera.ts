/** The printer card's camera button: while it is held, the camera's picture fills the card
 *  (`CardFrame.overlay`); the release ends it. A tap shows nothing — the hold's `fire` is not the
 *  tap's action — and a swipe that starts on the button disarms the press at `SEUIL_PX`, which
 *  ends the hold and hides the picture (`cardPress`, `stack/swipe.ts`). The one-contact-per-card
 *  lock of `attachSwipe` keeps the WebView's phantom contact from opening a second press.
 *
 *  `holdRepeat` ends every hold at `DELAI_SECOURS_MS` (`geste.ts`, a release the WebView never
 *  delivers): a look at the camera lasts five seconds at most, then the card comes back. */
import type { ScreenState } from '../boot/state';
import type { CardButton } from '../rendu/card-frame';
import { S } from './strings';

/** Past `delayMs` a contact is a hold, not a tap. `everyMs` only re-checks that the button is
 *  still on screen: a card swapped away mid-hold ends it (`holdRepeat`). */
export const CAMERA_HOLD = { delayMs: 300, everyMs: 250 };

/** The card key whose camera is shown, at most one: there is one finger on one card. Kept here,
 *  not in the frame, so a repaint while held keeps the picture — like the volume's pending level
 *  (`rendu/media-volume.ts`). */
let shown: string | null = null;

/** The camera picture to lay over the card `key`, while its button is held. */
export const cameraOverlay = (key: string, url: string): string | undefined => (shown === key ? url : undefined);

export function cameraButton(s: ScreenState, key: string): CardButton {
  const set = (next: string | null): void => {
    if (shown === next) return;
    shown = next;
    s.dessiner();
  };
  return {
    icon: 'camera', label: S.printerCamera, act: () => {},
    hold: { ...CAMERA_HOLD, fire: () => set(key), onEnd: () => { if (shown === key) set(null); } },
  };
}
