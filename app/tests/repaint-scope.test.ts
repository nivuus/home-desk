// @vitest-environment jsdom
/** The painter runs only when it matters.
 *
 *  The connection subscribes to EVERY `state_changed` of the installation, and every applied state
 *  used to schedule a full repaint — layout reads before and after included — even with the
 *  screen off. Two rules now: no paint while the document is hidden (one paint when it becomes
 *  visible again), and no paint for an entity the last paint did not read. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ECRANS } from '../src/ecran';
import { Etat } from '../src/etat';

const paints = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/boot/draw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/boot/draw')>();
  return {
    ...actual,
    dessiner: (s: Parameters<typeof actual.dessiner>[0]) => { paints.count++; actual.dessiner(s); },
  };
});

const { monterDemarrage, restaurerReseau } = await import('./aides');

let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
afterEach(() => { hidden = false; restaurerReseau(); });

describe('repaint scope', () => {
  it('a state for an entity no paint has read does not call the painter', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    const before = paints.count;
    await m.pousser('sensor.some_entity_no_screen_shows', '42');
    expect(paints.count).toBe(before);
  });

  it('a state for an entity the screen shows still repaints', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    const before = paints.count;
    await m.pousser('sun.sun', 'below_horizon');
    expect(paints.count).toBe(before + 1);
  });

  it('a hidden document is not painted, and is painted once on becoming visible', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    hidden = true;
    const before = paints.count;
    await m.pousser('sun.sun', 'below_horizon');
    await m.pousser('sun.sun', 'above_horizon');
    expect(paints.count).toBe(before);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paints.count).toBe(before + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paints.count).toBe(before + 1);
  });
});

describe('Etat read tracking', () => {
  it('notifies for entities the tracked paint read, and for all before any paint', async () => {
    const etat = new Etat();
    const cb = vi.fn();
    etat.surMaj(cb);
    etat.appliquer({ entity_id: 'light.a', state: 'on', attributes: {} });
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);   // no paint yet: nothing is known to be irrelevant

    etat.suivreLectures(() => { etat.lire('light.a'); etat.estUtilisable('sensor.b'); });
    etat.appliquer({ entity_id: 'light.other', state: 'on', attributes: {} });
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
    etat.appliquer({ entity_id: 'sensor.b', state: '3', attributes: {} });
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('a paint that throws forgets what it read, so every change notifies again', async () => {
    const etat = new Etat();
    const cb = vi.fn();
    etat.surMaj(cb);
    etat.suivreLectures(() => { etat.lire('light.a'); });
    expect(() => etat.suivreLectures(() => { throw new Error('paint failed'); })).toThrow('paint failed');
    etat.appliquer({ entity_id: 'light.other', state: 'on', attributes: {} });
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
