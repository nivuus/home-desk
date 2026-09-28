// @vitest-environment jsdom
//
/** Animations pushed by Home Assistant, on a MOUNTED screen (`monterDemarrage`, the kitchen): the
 *  subscription, the overlay, every way it ends, the first touch that closes it without actuating
 *  anything underneath, and reduced motion. The pure rules are in `animation.test.ts`. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ECRANS } from '../src/ecran';
import { monterDemarrage, restaurerReseau, vider, type Montage } from './aides';

const COMMANDE = 'home_desk/animations';
const VIDEO = { url: '/media/local/animations/foudre.webm', type: 'video', duree: null, fond: 'noir' };
const IMAGE = { url: '/media/local/animations/eclair.webp', type: 'image', duree: 4000, fond: 'noir' };

let play: ReturnType<typeof vi.spyOn>;
let erreur: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // jsdom does not implement media playback: `play()` is the browser's, doubled here so that a
  // test decides whether autoplay is granted or refused.
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  play.mockRestore();
  erreur.mockRestore();
  restaurerReseau();
});

/** The kitchen, with its first control (`light.hotte`) known to Home Assistant: a control whose
 *  entity was never pushed is refused by the press itself, which would make "nothing actuated"
 *  true for the wrong reason. */
const monter = () => monterDemarrage(ECRANS.cuisine, { etats: [['light.hotte', 'off']] });

const calque = (m: Montage) => m.racine.querySelector<HTMLElement>('.animation');

/** Pushes one animation and returns the timers armed by that push only. */
async function pousserAnimation(m: Montage, evenement: Record<string, unknown>) {
  const avant = m.minuteurFn.mock.calls.length;
  await m.diffuser(COMMANDE, evenement);
  return m.minuteurFn.mock.calls.slice(avant) as [() => void, number][];
}

/** A real tap on the first control of the kitchen: tiles act on `pointerdown`/`pointerup`
 *  (`geste.ts`), never on `click` — no control of this app listens to `click`. */
function taper(m: Montage): void {
  const tuile = m.racine.querySelector('.commande')!;
  expect(tuile, 'no control rendered on the kitchen screen').not.toBeNull();
  tuile.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
  tuile.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true }));
}

describe('animations pushed by Home Assistant', () => {
  it('subscribes with the screen name', async () => {
    const m = await monter();
    expect(m.abonnements.map((a) => a.commande))
      .toContainEqual({ type: COMMANDE, nom: ECRANS.cuisine.nom });
  });

  it('renders a muted, autoplaying, inline video over an opaque veil', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    const video = m.racine.querySelector<HTMLVideoElement>(
      '.animation video[muted][autoplay][playsinline]');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe(VIDEO.url);
    expect(video!.muted).toBe(true);
    expect(calque(m)!.classList.contains('animation-noir')).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('a transparent background has no veil', async () => {
    const m = await monter();
    await pousserAnimation(m, { ...VIDEO, fond: 'transparent' });
    expect(calque(m)).not.toBeNull();
    expect(calque(m)!.classList.contains('animation-noir')).toBe(false);
  });

  it('the natural end of the video closes the overlay', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    m.racine.querySelector('.animation video')!.dispatchEvent(new Event('ended'));
    expect(calque(m)).toBeNull();
  });

  it('an image is closed by its duree', async () => {
    const m = await monter();
    const minuteurs = await pousserAnimation(m, IMAGE);
    expect(m.racine.querySelector('.animation img')!.getAttribute('src')).toBe(IMAGE.url);
    expect(minuteurs.map(([, ms]) => ms)).toEqual([4000]);
    minuteurs[0]![0]();
    expect(calque(m)).toBeNull();
  });

  it('the 120 s cap is always armed, even for a video without duree', async () => {
    const m = await monter();
    const minuteurs = await pousserAnimation(m, VIDEO);
    expect(minuteurs.map(([, ms]) => ms)).toEqual([120_000]);
    minuteurs[0]![0]();
    expect(calque(m)).toBeNull();
  });

  it('a second animation replaces the first, and the first timer does not close it', async () => {
    const m = await monter();
    const [premier] = await pousserAnimation(m, IMAGE);
    const [second] = await pousserAnimation(m, VIDEO);
    expect(m.racine.querySelector('.animation img')).toBeNull();
    expect(m.racine.querySelector('.animation video')).not.toBeNull();

    premier![0]();
    await vider();
    expect(m.racine.querySelector('.animation video')).not.toBeNull();

    second![0]();
    expect(calque(m)).toBeNull();
  });

  it('the first touch closes the animation and actuates nothing underneath', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);

    taper(m);
    expect(calque(m)).toBeNull();
    expect(m.appelerService).not.toHaveBeenCalled();

    // The same tap, once nothing is playing, does reach the control: the one above was swallowed,
    // not aimed at something inert.
    taper(m);
    expect(m.appelerService).toHaveBeenCalledTimes(1);
  });

  it('a video that fails to load closes at once, with an error in the console', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    m.racine.querySelector('.animation video')!.dispatchEvent(new Event('error'));
    expect(calque(m)).toBeNull();
    expect(erreur).toHaveBeenCalled();
  });

  it('an image that fails to load closes at once, with an error in the console', async () => {
    const m = await monter();
    await pousserAnimation(m, IMAGE);
    m.racine.querySelector('.animation img')!.dispatchEvent(new Event('error'));
    expect(calque(m)).toBeNull();
    expect(erreur).toHaveBeenCalled();
  });

  it('a refused play() (autoplay policy, codec) closes at once, with an error in the console', async () => {
    play.mockRejectedValue(new DOMException('refused', 'NotAllowedError'));
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    await vider();
    expect(calque(m)).toBeNull();
    expect(erreur).toHaveBeenCalled();
  });

  it('a malformed payload is ignored, with an error in the console', async () => {
    const m = await monter();
    const minuteurs = await pousserAnimation(m, { ...VIDEO, type: 'audio' });
    expect(calque(m)).toBeNull();
    expect(minuteurs).toEqual([]);
    expect(erreur).toHaveBeenCalled();
  });

  it('with reduced motion, nothing is shown and the touch reaches the control', async () => {
    const avant = location.href;
    window.history.pushState({}, '', '/?mouvement=aucun');
    try {
      const m = await monter();
      const minuteurs = await pousserAnimation(m, VIDEO);
      expect(calque(m)).toBeNull();
      expect(minuteurs).toEqual([]);
      taper(m);
      expect(m.appelerService).toHaveBeenCalledTimes(1);
    } finally {
      window.history.pushState({}, '', avant);
    }
  });
});
