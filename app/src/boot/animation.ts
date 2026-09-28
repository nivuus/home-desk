/** Wiring of the animations pushed by Home Assistant (`home_desk.jouer_animation`): the
 *  subscription, the end timer, the first touch, the overlay's host, and the start of the medium.
 *  The rules themselves (payload, duration, token) are pure, in `src/animation.ts`; the overlay
 *  template is `rendu/animation.ts`.
 *
 *  The overlay is NOT part of the view `dessiner()` paints. It lives in its own host, a child of
 *  `#app` placed BEFORE the part `lit` manages there, and is rendered into that host by this
 *  module alone — on start and on close, never on a redraw. A view change during playback (the
 *  45 s automatic return, the 23:00/05:00 night boundary, the end of a night wake) replaces the
 *  view's template; had the overlay been appended to it, `lit` would have rebuilt the `<video>`
 *  from zero, with a `play()` nobody checks any more.
 *
 *  Every closer carries the token its animation was started under, and goes through
 *  `terminerAnimation`: a closer of a REPLACED animation (a late `ended`, `error` or refused
 *  `play()` of its element) is stale and does nothing, so it can never close the animation that
 *  replaced it. */
import { render } from 'lit';
import {
  lireAnimation, dureeEffective, jouerAnimation, fermerAnimation, type Animation,
} from '../animation';
import { rendreAnimation } from '../rendu/animation';
import type { AbonnableEvenements } from '../rechargement';
import type { ScreenState } from './state';

/** The integration's subscription command, written on both sides like `home_desk/abonner` (see
 *  `rechargement.ts`): on the Python side it is computed (`const.WS_ANIMATIONS`). */
const COMMANDE = 'home_desk/animations';

/** Subscribes this screen to its animations, places the overlay's host and arms the first-touch
 *  cut. Called ONCE for the lifetime of the page (`startWithScreen`, under its `initialise`
 *  guard): `abonner` is replayed by `Connexion` on every reconnection, and a second host or touch
 *  listener would pile up. */
export function armerAnimations(cx: AbonnableEvenements, nomEcran: string, s: ScreenState): void {
  // `prepend`, not `appendChild`: `lit`'s `render()` into `#app` owns everything from its marker
  // to the END of `#app`, and clears it all when the view's template changes (the motion engine
  // re-appends its own layers after every painting for that reason, `mouvement/moteur.ts`). A
  // node before the marker is outside that part: no painting of any view ever touches it.
  // Still a descendant of `#app`, so the colour tokens (`.m3`) and the capture below reach it.
  const hote = document.createElement('div');
  hote.className = 'animation-hote';
  s.racine.prepend(hote);
  s.hoteAnimation = hote;

  // The first touch while an animation is on screen closes it and reaches no control: capture on
  // `#app`, before any control underneath sees the `pointerdown` that starts its gesture
  // (`geste.ts` acts on `pointerup`, but only for a gesture its `pointerdown` opened). Every
  // control of this app acts on pointer events, none on `click`, so the click the browser
  // synthesizes from this same touch has nothing to actuate.
  // One exception, harmless: the capture listeners registered EARLIER on the way down still run
  // — `document` (re-arms the automatic return of a sub-view, `boot/wiring.ts`) and the one on
  // `#app` itself (re-arms an already woken night screen): `stopPropagation` does not stop
  // listeners of the same node. Both only re-arm a timer; neither actuates anything.
  s.racine.addEventListener('pointerdown', (ev) => {
    if (s.animation === null) return;
    ev.stopPropagation();
    ev.preventDefault();
    terminerAnimation(s, s.animation.jeton);
  }, true);

  cx.abonner({ type: COMMANDE, nom: nomEcran }, (evenement) => {
    const a = lireAnimation(evenement);
    if (a === null) {
      console.error('home-desk: malformed animation event ignored', evenement);
      return;
    }
    // Reduced motion (`prefers-reduced-motion` or `?mouvement=aucun`): nothing is played at all
    // — no overlay, no timer, and above all no invisible layer swallowing the next touch.
    if (s.niveauInitial === 'aucun') return;
    lancer(s, a);
  });
}

function lancer(s: ScreenState, a: Animation): void {
  // Replacing: the previous animation's timer goes with it (same discipline as `armerRetour`,
  // `boot/wiring.ts`) — its token would make it a no-op anyway, but nothing should keep running
  // for an animation that is gone.
  arreterMinuteur(s);
  detruireLecteur(s);
  const jeton = jouerAnimation(s, a);
  // ONE timer covers both the `duree` and the 120 s cap: `dureeEffective` is the smaller of the
  // two, so a video or a Lottie without `duree` that never ends still leaves the wall.
  s.minuteurAnimation = s.d.minuteurFn(() => terminerAnimation(s, jeton), dureeEffective(a));
  peindreCalque(s);
  demarrerMedia(s, jeton);
}

/** Starts the medium that `peindreCalque` has just put on screen. */
function demarrerMedia(s: ScreenState, jeton: number): void {
  const a = s.animation?.animation;
  if (!a) return;
  switch (a.type) {
    case 'video': {
      const video = s.hoteAnimation.querySelector<HTMLVideoElement>('.animation video');
      if (!video) {
        echouer(s, jeton, 'the video element was not rendered', a.url);
        return;
      }
      // `autoplay` alone fails SILENTLY when the browser refuses it (autoplay policy, codec): an
      // explicit `play()` is the only way to learn it and close instead of holding a black veil.
      // `Promise.resolve().then` so that an engine whose `play()` returns nothing still works.
      Promise.resolve().then(() => video.play())
        .catch((err: unknown) => echouer(s, jeton, 'the video could not be played', err));
      return;
    }
    case 'image':
      return;   // nothing to start: the timer ends it
    case 'lottie': {
      const canvas = s.hoteAnimation.querySelector<HTMLCanvasElement>('.animation canvas');
      if (!canvas) {
        echouer(s, jeton, 'the Lottie canvas was not rendered', a.url);
        return;
      }
      s.d.chargerLottie().then(
        (DotLottie) => {
          // The loader can resolve long after the push (first load of the bundle and its WASM):
          // by then this animation may have been replaced or closed by a touch. No player for an
          // animation that is gone — it would draw on a detached canvas and never be destroyed.
          if (s.animation?.jeton !== jeton) return;
          const lecteur = new DotLottie({ canvas, src: a.url, autoplay: true, loop: false });
          s.lecteurLottie = lecteur;
          lecteur.addEventListener('complete', () => terminerAnimation(s, jeton));
          lecteur.addEventListener('loadError', (ev) =>
            echouer(s, jeton, 'the Lottie animation could not be loaded', ev.error));
        },
        (err: unknown) => echouer(s, jeton, 'the Lottie player could not be loaded', err),
      );
      return;
    }
  }
}

/** A failure of the animation started under `jeton`. Silent when that token is stale: a replaced
 *  video's `play()` rejects with an `AbortError` once its element is removed, which is not a
 *  failure of anything still on screen. */
function echouer(s: ScreenState, jeton: number, message: string, detail: unknown): void {
  if (s.animation?.jeton !== jeton) return;
  console.error(`home-desk: ${message}`, detail);
  terminerAnimation(s, jeton);
}

/** Closes the animation started under `jeton` — nothing when the token is stale. */
export function terminerAnimation(s: ScreenState, jeton: number): void {
  if (!fermerAnimation(s, jeton)) return;
  arreterMinuteur(s);
  detruireLecteur(s);
  peindreCalque(s);
}

/** Releases the Lottie player of the animation that is closing or being replaced, if it has one.
 *  Only ever the CURRENT animation's player: a player is stored only while its token is current
 *  (see `demarrerMedia`), and is released before that token changes. */
function detruireLecteur(s: ScreenState): void {
  s.lecteurLottie?.destroy();
  s.lecteurLottie = null;
}

function arreterMinuteur(s: ScreenState): void {
  clearTimeout(s.minuteurAnimation);
  s.minuteurAnimation = undefined;
}

/** Renders the overlay (or nothing) into its own host: never through `dessiner()`. */
function peindreCalque(s: ScreenState): void {
  const enCours = s.animation;
  render(enCours === null ? '' : rendreAnimation(enCours, {
    fin: () => terminerAnimation(s, enCours.jeton),
    echec: () => echouer(s, enCours.jeton, 'the animation could not be loaded',
                         enCours.animation.url),
  }), s.hoteAnimation);
}
