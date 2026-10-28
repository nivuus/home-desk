/** How an image card shows its poster: blurred, and dimmed only as much as its text needs.
 *
 *  ONE definition for both sides of the contrast guarantee: the card's image layer
 *  (`rendu/card-frame.ts`) is painted with `posterFilter`, and the sampler
 *  (`rendu/poster-sampler.ts`) draws the very same blur before `tones.ts` measures the pixels
 *  under the text. Change the blur here, never in a stylesheet, or the tones would be computed
 *  on pixels the screen does not show.
 *
 *  Why a blur (owner's choice, 2026-10-28): a sharp poster puts edges under the text, and an edge
 *  is what drops the worst-pixel contrast — the solid plates that made up for it were refused.
 *  A blur keeps the poster's colours and spreads its edges out. It cannot make a mid-tone poster
 *  readable on its own (a uniform luminance near 0.18 caps every text colour at 4.6:1), hence the
 *  dimming `tones.ts` adds only when the blurred poster still falls short. */

/** The blur's standard deviation, in CSS px, the `blur()` filter's unit. */
export const POSTER_BLUR_PX = 24;

/** How far the layer overhangs the card on each side. A blurred layer fades to transparent over
 *  about three standard deviations from its own edge; overhanging by that much keeps the fade
 *  outside the card (`overflow: hidden` clips it), so the card's edges show the poster, not the
 *  theme colour behind it. */
export const POSTER_BLEED_PX = 3 * POSTER_BLUR_PX;

/** The CSS filter of the image layer. `dim` is the brightness factor of `CardTones` (1: none). */
export function posterFilter(dim: number): string {
  return dim < 1 ? `blur(${POSTER_BLUR_PX}px) brightness(${dim})` : `blur(${POSTER_BLUR_PX}px)`;
}
