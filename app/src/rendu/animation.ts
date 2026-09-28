/** The animation overlay: above every view, full screen, `pointer-events: none` (the first touch
 *  is caught in capture on `#app` by `boot/animation.ts`, never by this layer), an opaque veil
 *  for `fond: 'noir'`, and the medium itself. Pure rendering: the two callbacks come from the
 *  wiring, already bound to the token of this animation.
 *
 *  `keyed` on the token: each animation gets FRESH elements. Without it, lit would reuse the same
 *  `<video>` for a replacing animation and only swap its `src` — the new one would inherit the
 *  element of the one it replaced, whose playback state is not its own. */
import { html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type { AnimationEnCours } from '../animation';

export type RappelsAnimation = {
  /** The medium reached its natural end. */
  fin: () => void;
  /** The medium failed to load or decode. */
  echec: () => void;
};

function media(enCours: AnimationEnCours, r: RappelsAnimation) {
  const a = enCours.animation;
  switch (a.type) {
    // Always muted: autoplay with sound is refused by the browser, and a wall screen never speaks
    // on its own. `.muted` as well as the attribute: the attribute alone is only the DEFAULT
    // (`defaultMuted`), which some engines do not copy to the live state on a cloned element.
    case 'video':
      return html`<video class="animation-media" src=${a.url} muted .muted=${true} autoplay
                         playsinline @ended=${r.fin} @error=${r.echec}></video>`;
    case 'image':
      return html`<img class="animation-media" src=${a.url} alt="" @error=${r.echec}>`;
    // Task 4 renders the Lottie canvas here; until then `boot/animation.ts` closes a Lottie as
    // soon as it starts, so this branch is never on screen.
    case 'lottie':
      return nothing;
  }
}

export function rendreAnimation(enCours: AnimationEnCours, r: RappelsAnimation) {
  const fond = enCours.animation.fond === 'noir' ? 'animation-noir' : '';
  return keyed(enCours.jeton, html`<div class="animation ${fond}">${media(enCours, r)}</div>`);
}
