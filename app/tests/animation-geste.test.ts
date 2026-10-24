// @vitest-environment jsdom
//
/** Animations pushed by Home Assistant, on a MOUNTED screen (`monterDemarrage`, the kitchen): the
 *  subscription, the overlay, every way it ends, the first touch that closes it without actuating
 *  anything underneath, and reduced motion. The pure rules are in `animation.test.ts`; the closing
 *  fade is in `animation-fondu.test.ts`, the Lottie player in `animation-lottie.test.ts`. */
import { describe, it, expect, vi } from 'vitest';
import { ECRANS } from '../src/ecran';
import { Connexion } from '../src/connexion';
import { monterDemarrage, vider, SocketFactice, jetons, stockageSansSession } from './aides';
import { COMMANDE, VIDEO, IMAGE, play, erreur, monter, calque, pousserAnimation, taper } from './animation-aides';

describe('animations pushed by Home Assistant', () => {
  it('subscribes with the screen name', async () => {
    const m = await monter();
    expect(m.abonnements.map((a) => a.commande))
      .toContainEqual({ type: COMMANDE, nom: ECRANS.cuisine.nom });
  });

  it('the subscription is armed once, and re-sent on every new socket under a new id', async () => {
    // Over a REAL `Connexion`: the replay on reconnection is its job, and what this proves is
    // that the animations take the path it replays (`abonner`), exactly once — not a one-shot
    // command lost with the first socket, nor a second arming that would play everything twice.
    const cx = new Connexion({ ...jetons, expires: Date.now() + 3_600_000 }, {
      origineWs: 'ws://test', WebSocketImpl: SocketFactice as any,
      intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any, stockage: stockageSansSession,
    });
    const m = await monterDemarrage(ECRANS.cuisine, { createConnection: () => cx });
    const abonnementsSur = (ws: SocketFactice) => ws.envoyes.filter((e) => e.type === COMMANDE);

    const [premiere] = SocketFactice.ouvertes;
    expect(SocketFactice.ouvertes).toHaveLength(1);
    expect(abonnementsSur(premiere!)).toEqual([
      { type: COMMANDE, nom: ECRANS.cuisine.nom, id: expect.any(Number) }]);
    const ancienId = abonnementsSur(premiere!)[0]!.id;

    premiere!.couper();
    await cx.connecter();
    await vider();
    const seconde = SocketFactice.ouvertes[1]!;
    expect(seconde).toBeDefined();
    expect(abonnementsSur(seconde)).toEqual([
      { type: COMMANDE, nom: ECRANS.cuisine.nom, id: expect.any(Number) }]);
    const nouvelId = abonnementsSur(seconde)[0]!.id;
    expect(nouvelId).not.toBe(ancienId);

    // The replayed subscription is live: an event under its new id reaches the overlay.
    seconde.recevoir({ type: 'event', id: nouvelId, event: VIDEO });
    await vider();
    expect(calque(m)).not.toBeNull();
    expect(m.racine.querySelectorAll('.animation-hote')).toHaveLength(1);
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
    await vider();   // the fade (`the closing fade`) ends within a microtask under the stub
    expect(calque(m)).toBeNull();
  });

  it('an image is closed by its duree', async () => {
    const m = await monter();
    const minuteurs = await pousserAnimation(m, IMAGE);
    expect(m.racine.querySelector('.animation img')!.getAttribute('src')).toBe(IMAGE.url);
    expect(minuteurs.map(([, ms]) => ms)).toEqual([4000]);
    minuteurs[0]![0]();
    await vider();
    expect(calque(m)).toBeNull();
  });

  it('the 120 s cap is always armed, even for a video without duree', async () => {
    const m = await monter();
    const minuteurs = await pousserAnimation(m, VIDEO);
    expect(minuteurs.map(([, ms]) => ms)).toEqual([120_000]);
    minuteurs[0]![0]();
    await vider();
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
    await vider();
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

  it('a view change during playback keeps the same video element', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    const video = m.racine.querySelector('.animation video');
    expect(video).not.toBeNull();

    // The whole-house sub-view replaces the home view's template (the 45 s automatic return and
    // the night boundary do the same the other way round).
    location.hash = '#maison';
    window.dispatchEvent(new Event('hashchange'));
    await vider();
    expect(m.racine.querySelector('.commande'), 'the view did not change').toBeNull();

    expect(m.racine.querySelector('.animation video')).toBe(video);
    expect(m.racine.contains(video)).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('closing or replacing an animation clears its timer', async () => {
    const m = await monter();
    let id = 0;
    m.minuteurFn.mockImplementation(() => ++id + 1000);
    const efface = vi.spyOn(globalThis, 'clearTimeout');
    try {
      await pousserAnimation(m, IMAGE);
      const premier = id + 1000;
      await pousserAnimation(m, VIDEO);
      const second = id + 1000;
      expect(efface).toHaveBeenCalledWith(premier);
      expect(efface).not.toHaveBeenCalledWith(second);

      taper(m);
      expect(efface).toHaveBeenCalledWith(second);
    } finally {
      efface.mockRestore();
    }
  });

  it('a late ended or error of a replaced video does not close its successor', async () => {
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    const a = m.racine.querySelector('.animation video')!;
    await pousserAnimation(m, { ...VIDEO, url: '/media/local/animations/voyage.webm' });
    const b = m.racine.querySelector('.animation video');
    expect(b).not.toBe(a);

    a.dispatchEvent(new Event('ended'));
    a.dispatchEvent(new Event('error'));
    await vider();

    expect(m.racine.querySelector('.animation video')).toBe(b);
    expect(erreur).not.toHaveBeenCalled();
  });

  it('a replaced video whose play() rejects afterwards neither closes nor blames its successor', async () => {
    let rejeter!: (e: unknown) => void;
    play.mockReturnValueOnce(new Promise<void>((_, r) => { rejeter = r; }));
    const m = await monter();
    await pousserAnimation(m, VIDEO);
    await pousserAnimation(m, { ...VIDEO, url: '/media/local/animations/voyage.webm' });
    const b = m.racine.querySelector('.animation video');

    // What a browser does to the replaced element's pending play(): AbortError.
    rejeter(new DOMException('removed', 'AbortError'));
    await vider();

    expect(m.racine.querySelector('.animation video')).toBe(b);
    expect(erreur).not.toHaveBeenCalled();
  });
});

