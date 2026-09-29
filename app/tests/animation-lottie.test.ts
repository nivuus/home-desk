// @vitest-environment jsdom
//
/** The Lottie animations, on a MOUNTED screen: the player is a double (`FauxLottie`), the bundle
 *  loader is `m.chargerLottie`, never a real network fetch. */
import { describe, it, expect } from 'vitest';
import { vider } from './aides';
import { VIDEO, IMAGE, LOTTIE, FauxLottie, erreur, monter, calque, pousserAnimation, taper } from './animation-aides';

describe('Lottie animations', () => {
  /** A mounted kitchen whose loader resolves the double at once. */
  async function monterAvecLottie() {
    const m = await monter();
    m.chargerLottie.mockResolvedValue(FauxLottie);
    return m;
  }

  it('renders a canvas and plays the animation once on it', async () => {
    const m = await monterAvecLottie();
    await pousserAnimation(m, LOTTIE);
    await vider();
    const canvas = m.racine.querySelector('.animation canvas');
    expect(canvas).not.toBeNull();
    expect(m.chargerLottie).toHaveBeenCalledTimes(1);
    expect(FauxLottie.crees).toHaveLength(1);
    expect(FauxLottie.crees[0]!.config).toEqual(
      { canvas, src: LOTTIE.url, autoplay: true, loop: false });
  });

  it('its complete event closes the overlay and destroys the player', async () => {
    const m = await monterAvecLottie();
    await pousserAnimation(m, LOTTIE);
    await vider();
    const lecteur = FauxLottie.crees[0]!;
    lecteur.emettre('complete');
    await vider();
    expect(calque(m)).toBeNull();
    expect(lecteur.destroy).toHaveBeenCalledTimes(1);
    expect(erreur).not.toHaveBeenCalled();
  });

  it('its loadError closes the overlay with an error, and destroys the player', async () => {
    const m = await monterAvecLottie();
    await pousserAnimation(m, LOTTIE);
    await vider();
    const lecteur = FauxLottie.crees[0]!;
    lecteur.emettre('loadError', { error: new Error('404') });
    expect(calque(m)).toBeNull();
    expect(erreur).toHaveBeenCalled();
    expect(lecteur.destroy).toHaveBeenCalledTimes(1);
  });

  it('the timer, the touch and a replacement each destroy the player', async () => {
    const m = await monterAvecLottie();

    const [minuteur] = await pousserAnimation(m, LOTTIE);
    await vider();
    minuteur![0]();
    await vider();
    expect(calque(m)).toBeNull();
    expect(FauxLottie.crees[0]!.destroy).toHaveBeenCalledTimes(1);

    await pousserAnimation(m, LOTTIE);
    await vider();
    taper(m);
    expect(calque(m)).toBeNull();
    expect(FauxLottie.crees[1]!.destroy).toHaveBeenCalledTimes(1);

    await pousserAnimation(m, LOTTIE);
    await vider();
    await pousserAnimation(m, VIDEO);
    expect(FauxLottie.crees[2]!.destroy).toHaveBeenCalledTimes(1);
    expect(m.racine.querySelector('.animation video')).not.toBeNull();
  });

  it('a loader that fails closes the overlay at once, with an error in the console', async () => {
    const m = await monter();
    m.chargerLottie.mockRejectedValue(new Error('script error'));
    await pousserAnimation(m, LOTTIE);
    await vider();
    expect(calque(m)).toBeNull();
    expect(erreur).toHaveBeenCalled();
  });

  it('a loader resolving after the Lottie was replaced builds no player', async () => {
    let resoudre!: (c: unknown) => void;
    const m = await monter();
    m.chargerLottie.mockReturnValue(new Promise((r) => { resoudre = r; }));
    await pousserAnimation(m, LOTTIE);
    await pousserAnimation(m, VIDEO);
    const video = m.racine.querySelector('.animation video');

    resoudre(FauxLottie);
    await vider();

    expect(FauxLottie.crees).toHaveLength(0);
    expect(m.racine.querySelector('.animation video')).toBe(video);
    expect(erreur).not.toHaveBeenCalled();
  });

  it('a loader resolving after the Lottie was closed by a touch builds no player', async () => {
    let resoudre!: (c: unknown) => void;
    const m = await monter();
    m.chargerLottie.mockReturnValue(new Promise((r) => { resoudre = r; }));
    await pousserAnimation(m, LOTTIE);
    taper(m);
    expect(calque(m)).toBeNull();

    resoudre(FauxLottie);
    await vider();

    expect(FauxLottie.crees).toHaveLength(0);
    expect(calque(m)).toBeNull();
  });

  it('a loader failing after the Lottie was replaced neither closes nor blames its successor', async () => {
    let rejeter!: (e: unknown) => void;
    const m = await monter();
    m.chargerLottie.mockReturnValue(new Promise((_, r) => { rejeter = r; }));
    await pousserAnimation(m, LOTTIE);
    await pousserAnimation(m, VIDEO);
    const video = m.racine.querySelector('.animation video');

    rejeter(new Error('script error'));
    await vider();

    expect(m.racine.querySelector('.animation video')).toBe(video);
    expect(erreur).not.toHaveBeenCalled();
  });

  it('a late complete or loadError of a replaced player does not close its successor', async () => {
    const m = await monterAvecLottie();
    await pousserAnimation(m, LOTTIE);
    await vider();
    const ancien = FauxLottie.crees[0]!;
    await pousserAnimation(m, { ...LOTTIE, url: '/media/local/animations/pluie.json' });
    await vider();

    ancien.emettre('complete');
    ancien.emettre('loadError', { error: new Error('late') });
    await vider();

    expect(m.racine.querySelector('.animation canvas')).not.toBeNull();
    expect(FauxLottie.crees[1]!.destroy).not.toHaveBeenCalled();
    expect(erreur).not.toHaveBeenCalled();
  });

  it('a video or an image never loads the Lottie player', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    await pousserAnimation(m, IMAGE);
    await vider();
    expect(m.chargerLottie).toHaveBeenCalledTimes(0);
  });
});

