/** The palette fade: the ONLY exception to the transform/opacity rule of the motion engine, and a
 *  bounded one. Moved out of `moteur.ts` on 2026-11-06 (500-line limit), behaviour unchanged.
 *
 *  The class `.fondu-palette` is set, the palette switches, then the class is REMOVED. Never a
 *  permanent colour transition on the whole tree: it would also cross every tile state change and
 *  cost repaints all day. The guard on the current palette matters as much: `dessiner()` calls this
 *  on every burst of `state_changed` and every 20 s through the clock.
 *
 *  Under `prefers-reduced-motion` (or a hidden screen) the palette switches at once — the screen
 *  stays right, only the animation is skipped. A throwing `isHidden` is caught and treated as "not
 *  hidden": a missed palette fade never justifies a wrong palette, nor disabling the engine. */
import { PALETTE_MS } from './grammaire';

const FADING = 'fondu-palette';
const DARK = 'sombre';  // policy: allow-fr — the class name `base.css` styles

export function createPaletteFade(
  root: HTMLElement,
  isHidden: () => boolean,
  timer: (cb: () => void, ms: number) => number,
): (dark: boolean) => void {
  // `base.css` (`.fondu-palette`) reads its duration from this same constant.
  document.documentElement.style.setProperty('--mvt-palette', `${PALETTE_MS}ms`);
  // `false`, never `null`: at mount the root does not carry the dark class — the resting palette
  // IS the light one, and a first `switchTo(false)` must replay nothing.
  let current = false;

  return function switchTo(dark: boolean): void {
    if (current === dark) return;
    current = dark;
    let hidden = false;
    try { hidden = isHidden(); } catch { hidden = false; }
    const both = [root, document.documentElement];
    if (hidden) {
      for (const el of both) el.classList.toggle(DARK, dark);
      return;
    }
    for (const el of both) { el.classList.add(FADING); el.classList.toggle(DARK, dark); }
    timer(() => { for (const el of both) el.classList.remove(FADING); }, PALETTE_MS);
  };
}
