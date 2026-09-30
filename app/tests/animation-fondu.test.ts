// @vitest-environment jsdom
//
/** The closing fade of the animation overlay (`terminerAnimation`, `boot/animation.ts`): what
 *  fades, what closes at once, and what a fade in progress must never disturb. */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { EFFET_SORTIE, SORTIE_MS } from '../src/mouvement/grammaire';
import { vider } from './aides';
import { VIDEO, IMAGE, LOTTIE, FauxLottie, monter, calque, pousserAnimation, taper } from './animation-aides';

describe('the closing fade', () => {
  /** `Element.prototype.animate`, doubled: jsdom has none, and a test must decide WHEN a fade
   *  ends. Every call is recorded; `finir` ends the fade started by the n-th call. */
  let animate: MockInstance<typeof Element.prototype.animate>;
  let fins: (() => void)[];
  beforeEach(() => {
    fins = [];
    animate = vi.spyOn(Element.prototype, 'animate').mockImplementation(() => {
      let fin!: () => void;
      const finished = new Promise<void>((resolu) => { fin = resolu; });
      fins.push(fin);
      return { finished, cancel() {} } as unknown as Animation;
    });
  });
  afterEach(() => animate.mockRestore());

  /** The fades of THE OVERLAY: the motion engine calls the same `animate` on its own layers. */
  const indices = () => animate.mock.contexts
    .map((el: unknown, i: number) => ((el as Element).classList.contains('animation') ? i : -1))
    .filter((i: number) => i >= 0);
  const fondus = () => indices().map((i: number) => animate.mock.calls[i]!);
  const finir = (n = 0) => fins[indices()[n]!]!();

  it('the natural end of a video fades the overlay out, then removes it', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    m.racine.querySelector('.animation video')!.dispatchEvent(new Event('ended'));

    expect(fondus()).toHaveLength(1);
    const options = fondus()[0]![1] as KeyframeAnimationOptions;
    expect(options.duration).toBe(SORTIE_MS);
    expect(options.easing).toBe(EFFET_SORTIE);
    expect(options.fill).toBe('forwards');
    expect(calque(m), 'removed before its fade ended').not.toBeNull();

    finir();
    await vider();
    expect(calque(m)).toBeNull();
  });

  it('its duree and the 120 s cap fade it out too', async () => {
    const m = await monter();
    const [minuteur] = await pousserAnimation(m, IMAGE);
    minuteur![0]();
    expect(fondus()).toHaveLength(1);
    finir();
    await vider();
    expect(calque(m)).toBeNull();
  });

  it('the first touch closes it at once, with no fade', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    taper(m);
    expect(fondus()).toHaveLength(0);
    expect(calque(m)).toBeNull();
  });

  it('a load failure closes it at once, with no fade', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    m.racine.querySelector('.animation video')!.dispatchEvent(new Event('error'));
    expect(fondus()).toHaveLength(0);
    expect(calque(m)).toBeNull();
  });

  it('a touch during the fade reaches the control underneath', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    m.racine.querySelector('.animation video')!.dispatchEvent(new Event('ended'));
    taper(m);
    expect(m.appelerService).toHaveBeenCalledTimes(1);
  });

  it('an animation pushed during the fade is not removed when the fade ends', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    m.racine.querySelector('.animation video')!.dispatchEvent(new Event('ended'));
    await pousserAnimation(m, IMAGE);

    finir();
    await vider();
    expect(m.racine.querySelector('.animation img')).not.toBeNull();
  });

  it('the end of a fade never destroys the player of the Lottie that replaced it', async () => {
    const m = await monter();
    m.chargerLottie.mockResolvedValue(FauxLottie);
    await pousserAnimation(m, LOTTIE);
    await vider();
    FauxLottie.crees[0]!.emettre('complete');   // the first one starts fading out
    await pousserAnimation(m, LOTTIE);           // and a second one replaces it
    await vider();
    expect(FauxLottie.crees).toHaveLength(2);

    finir();                                     // the FIRST fade ends, late
    await vider();
    expect(FauxLottie.crees[1]!.destroy).not.toHaveBeenCalled();
    expect(m.racine.querySelector('.animation canvas')).not.toBeNull();
  });

  it('a Lottie player lives until its fade ends', async () => {
    const m = await monter();
    m.chargerLottie.mockResolvedValue(FauxLottie);
    await pousserAnimation(m, LOTTIE);
    await vider();
    const lecteur = FauxLottie.crees[0]!;
    lecteur.emettre('complete');
    expect(lecteur.destroy).not.toHaveBeenCalled();

    finir();
    await vider();
    expect(lecteur.destroy).toHaveBeenCalledTimes(1);
    expect(calque(m)).toBeNull();
  });
});

