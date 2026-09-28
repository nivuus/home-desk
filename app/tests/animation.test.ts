/** Pure logic of the animations pushed by Home Assistant (`src/animation.ts`): reading the wire
 *  payload, the effective duration, and the token that keeps a replaced animation's closers from
 *  closing its successor. The mounted behaviour (render, timers, touch) is in
 *  `animation-geste.test.ts`. */
import { describe, it, expect } from 'vitest';
import {
  lireAnimation, dureeEffective, jouerAnimation, fermerAnimation, DUREE_MAX_MS,
  type Animation, type EtatAnimation,
} from '../src/animation';

const video = { url: '/media/local/animations/foudre.webm', type: 'video', duree: null, fond: 'noir' };

describe('lireAnimation', () => {
  it('accepts the three types as the component sends them', () => {
    expect(lireAnimation(video)).toEqual(video);
    expect(lireAnimation({ ...video, type: 'image', duree: 4000, fond: 'transparent' }))
      .toEqual({ ...video, type: 'image', duree: 4000, fond: 'transparent' });
    expect(lireAnimation({ ...video, type: 'lottie', url: '/media/local/a.lottie' }))
      .toEqual({ ...video, type: 'lottie', url: '/media/local/a.lottie' });
  });

  it('refuses a missing or empty url', () => {
    const { url: _, ...sansUrl } = video;
    expect(lireAnimation(sansUrl)).toBeNull();
    expect(lireAnimation({ ...video, url: '' })).toBeNull();
    expect(lireAnimation({ ...video, url: 42 })).toBeNull();
  });

  it('refuses an unknown type', () => {
    expect(lireAnimation({ ...video, type: 'audio' })).toBeNull();
    expect(lireAnimation({ ...video, type: undefined })).toBeNull();
  });

  it('refuses a non-numeric, non-finite or non-positive duree', () => {
    expect(lireAnimation({ ...video, duree: '4000' })).toBeNull();
    expect(lireAnimation({ ...video, duree: Number.NaN })).toBeNull();
    expect(lireAnimation({ ...video, duree: Number.POSITIVE_INFINITY })).toBeNull();
    expect(lireAnimation({ ...video, duree: 0 })).toBeNull();
    expect(lireAnimation({ ...video, duree: -5 })).toBeNull();
    // The component always sends the key: `null` means "to its end", absence is a malformed payload.
    const { duree: _, ...sansDuree } = video;
    expect(lireAnimation(sansDuree)).toBeNull();
  });

  it('refuses an unknown or missing background', () => {
    expect(lireAnimation({ ...video, fond: 'blanc' })).toBeNull();
    const { fond: _, ...sansFond } = video;
    expect(lireAnimation(sansFond)).toBeNull();
  });
});

describe('dureeEffective', () => {
  const a = (duree: number | null): Animation => ({ ...(video as Animation), duree });

  it('is the cap when there is no duree', () => {
    expect(DUREE_MAX_MS).toBe(120_000);
    expect(dureeEffective(a(null))).toBe(120_000);
  });

  it('is the duree when shorter than the cap', () => {
    expect(dureeEffective(a(4000))).toBe(4000);
  });

  it('never exceeds the cap', () => {
    expect(dureeEffective(a(300_000))).toBe(120_000);
  });
});

describe('jouerAnimation / fermerAnimation', () => {
  const etat = (): EtatAnimation => ({ animation: null, jetonAnimation: 0 });
  const a = video as Animation;
  const b: Animation = { ...a, url: '/media/local/animations/voyage.webm' };

  it('plays, then closes with its own token', () => {
    const s = etat();
    const jeton = jouerAnimation(s, a);
    expect(s.animation).toEqual({ animation: a, jeton });
    expect(fermerAnimation(s, jeton)).toBe(true);
    expect(s.animation).toBeNull();
  });

  it('a second animation replaces the first, and the first token no longer closes anything', () => {
    const s = etat();
    const premier = jouerAnimation(s, a);
    const second = jouerAnimation(s, b);
    expect(second).not.toBe(premier);
    expect(s.animation?.animation).toBe(b);
    expect(fermerAnimation(s, premier)).toBe(false);
    expect(s.animation?.animation).toBe(b);
    expect(fermerAnimation(s, second)).toBe(true);
    expect(s.animation).toBeNull();
  });

  it('closing twice is harmless', () => {
    const s = etat();
    const jeton = jouerAnimation(s, a);
    fermerAnimation(s, jeton);
    expect(fermerAnimation(s, jeton)).toBe(false);
  });
});
