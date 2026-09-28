/** Wiring of the animations pushed by Home Assistant (`home_desk.jouer_animation`): the
 *  subscription, the end timer, the first touch, and the start of the medium once rendered. The
 *  rules themselves (payload, duration, token) are pure, in `src/animation.ts`; the overlay is
 *  `rendu/animation.ts`, painted by `dessiner()` over every view (`boot/draw.ts`).
 *
 *  Every closer carries the token its animation was started under, and goes through
 *  `terminerAnimation`: a closer of a REPLACED animation (its timer, a late `ended`) is stale and
 *  does nothing, so it can never close the animation that replaced it. */
import {
  lireAnimation, dureeEffective, jouerAnimation, fermerAnimation, type Animation,
} from '../animation';
import { rendreAnimation } from '../rendu/animation';
import type { AbonnableEvenements } from '../rechargement';
import type { ScreenState } from './state';

/** The integration's subscription command, written on both sides like `home_desk/abonner` (see
 *  `rechargement.ts`): on the Python side it is computed (`const.WS_ANIMATIONS`). */
const COMMANDE = 'home_desk/animations';

/** Subscribes this screen to its animations and arms the first-touch cut. Called ONCE for the
 *  lifetime of the page (`startWithScreen`, under its `initialise` guard): `abonner` is replayed
 *  by `Connexion` on every reconnection, and a second touch listener would pile up. */
export function armerAnimations(cx: AbonnableEvenements, nomEcran: string, s: ScreenState): void {
  // The first touch while an animation is on screen closes it and goes NO further: capture on
  // `#app`, before any control underneath sees the `pointerdown` that starts its gesture
  // (`geste.ts` acts on `pointerup`, but only for a gesture its `pointerdown` opened). Every
  // control of this app acts on pointer events, none on `click`, so the click the browser
  // synthesizes from this same touch has nothing to actuate.
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
  const jeton = jouerAnimation(s, a);
  // ONE timer covers both the `duree` and the 120 s cap: `dureeEffective` is the smaller of the
  // two, so a video or a Lottie without `duree` that never ends still leaves the wall.
  s.d.minuteurFn(() => terminerAnimation(s, jeton), dureeEffective(a));
  s.dessiner();
  demarrerMedia(s, jeton);
}

/** Starts the medium that `dessiner()` has just put on screen. */
function demarrerMedia(s: ScreenState, jeton: number): void {
  const a = s.animation?.animation;
  if (!a) return;
  switch (a.type) {
    case 'video': {
      const video = s.racine.querySelector<HTMLVideoElement>('.animation video');
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
    case 'lottie':
      // Task 4 (the Lottie player) replaces this branch. Until then a Lottie closes at once,
      // with an error, rather than showing an empty veil for up to 120 s.
      echouer(s, jeton, 'Lottie animations are not supported yet', a.url);
      return;
  }
}

function echouer(s: ScreenState, jeton: number, message: string, detail: unknown): void {
  console.error(`home-desk: ${message}`, detail);
  terminerAnimation(s, jeton);
}

/** Closes the animation started under `jeton` and repaints — nothing when the token is stale. */
export function terminerAnimation(s: ScreenState, jeton: number): void {
  if (fermerAnimation(s, jeton)) s.dessiner();
}

/** The overlay `dessiner()` adds over the view it paints: empty when nothing is playing. */
export function calqueAnimation(s: ScreenState) {
  const enCours = s.animation;
  if (enCours === null) return '';
  return rendreAnimation(enCours, {
    fin: () => terminerAnimation(s, enCours.jeton),
    echec: () => echouer(s, enCours.jeton, 'the animation could not be loaded',
                         enCours.animation.url),
  });
}
