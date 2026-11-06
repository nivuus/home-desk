/** The palette fade: the ONLY exception to the transform/opacity rule of the motion engine, and a
 *  bounded one. Moved out of `moteur.ts` on 2026-11-06 (500-line limit), unchanged.
 *
 *  The class `.fondu-palette` is set, the palette switches, then the class is REMOVED. Never a
 *  permanent colour transition on the whole tree: it would also cross every tile state change and
 *  cost repaints all day. The guard on the current palette matters as much: `dessiner()` calls this
 *  on every burst of `state_changed` and every 20 s through the clock.
 *
 *  Under `prefers-reduced-motion` (or a hidden screen) the palette switches DRY — the screen stays
 *  right, only the animation is skipped. A throwing `estMasquee` is caught and treated as "not
 *  hidden": a missed palette fade never justifies a wrong palette, nor disabling the engine. */
import { PALETTE_MS } from './grammaire';

export function creerPalette(
  racine: HTMLElement,
  estMasquee: () => boolean,
  minuteurFn: (cb: () => void, ms: number) => number,
): (sombre: boolean) => void {
  // `base.css` (`.fondu-palette`) reads its duration from this same constant.
  document.documentElement.style.setProperty('--mvt-palette', `${PALETTE_MS}ms`);
  // `false`, never `null`: at mount `racine` does not carry `sombre` — the resting palette IS the
  // light one, and a first `basculer(false)` must replay nothing.
  let sombreCourant = false;

  return function basculer(sombre: boolean): void {
    if (sombreCourant === sombre) return;
    sombreCourant = sombre;
    let masquee = false;
    try { masquee = estMasquee(); } catch { masquee = false; }
    if (masquee) {
      racine.classList.toggle('sombre', sombre);
      document.documentElement.classList.toggle('sombre', sombre);
      return;
    }
    racine.classList.add('fondu-palette');
    document.documentElement.classList.add('fondu-palette');
    racine.classList.toggle('sombre', sombre);
    document.documentElement.classList.toggle('sombre', sombre);
    minuteurFn(() => {
      racine.classList.remove('fondu-palette');
      document.documentElement.classList.remove('fondu-palette');
    }, PALETTE_MS);
  };
}
