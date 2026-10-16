/** Short press or long press, on the tiles that offer both — today the vacuum tiles: a short
 *  press cleans the room the tile names, a long press asks where and how many passes.
 *
 *  Every other tile acts on `pointerdown` (see `interaction.ts`, why immediacy matters on these
 *  tablets). Here that is impossible by construction: at contact nobody can know whether the
 *  finger will stay. So, exactly like the gauge tiles of `geste.ts`, the short action waits for
 *  the release, while the `:active` layer still answers at contact — the tile is FELT at once,
 *  it ACTS on release. A finger that slides past `SEUIL_PX` cancels both: it was neither. */
import { SEUIL_PX } from './geste';
import { minuteurFnParDefaut } from './minuteurs';

/** Long enough not to fire on a firm tap, short enough not to feel like a wait. Android's own
 *  long-press timeout is 400–500 ms; a wall tablet is tapped from arm's length, a bit firmer. */
export const LONG_PRESS_MS = 600;

export type LongPress = (ev: PointerEvent, onShort: () => void, onLong: () => void) => void;

export function createLongPress(minuteurFn: typeof setTimeout = minuteurFnParDefaut): LongPress {
  return (ev, onShort, onLong) => {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el) return;
    const x0 = ev.clientX;
    const y0 = ev.clientY;

    const timer = minuteurFn(() => { cleanup(); onLong(); }, LONG_PRESS_MS);

    function cleanup() {
      clearTimeout(timer);
      el!.releasePointerCapture?.(ev.pointerId);
      el!.removeEventListener('pointerup', release);
      el!.removeEventListener('pointercancel', cleanup);
      el!.removeEventListener('pointermove', move);
    }
    function release() { cleanup(); onShort(); }
    function move(e: PointerEvent) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) >= SEUIL_PX) cleanup();
    }

    el.setPointerCapture?.(ev.pointerId);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', cleanup);
    el.addEventListener('pointermove', move);
  };
}
