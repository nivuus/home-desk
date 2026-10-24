// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/car';
import { wireCardActions } from '../src/cards/actions';
import { brancherVoiture } from '../src/rendu/voiture';
import type { Voiture } from '../src/screen-types';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith, T0 } from './card-aides';

const V: Required<Omit<Voiture, 'note'>> = {
  batterie: 'sensor.b', autonomie: 'sensor.a', branchee: 'binary_sensor.p',
  enCharge: 'binary_sensor.c', clim: 'binary_sensor.k', demarrerClim: 'button.k_on',
  arreterClim: 'button.k_off', limite: 'number.l', finCharge: 'sensor.f',
  demarrerCharge: 'button.c_on', arreterCharge: 'button.c_off', boutonLimite: 'button.l80',
};

type CarOpts = {
  branchee?: string; enCharge?: string; batterie?: number; limite?: number; autonomie?: number;
  finCharge?: string; clim?: string; climEnVol?: 'demarrage' | 'arret' | null;
  sans?: (keyof Voiture)[];
};

/** A car fixture: the declared entities, minus `sans`, and their states. No `limite` given, no
 *  limit declared. */
function car(o: CarOpts = {}): [Frame, ScreenState] {
  const voiture: Voiture = { ...V };
  for (const k of o.sans ?? []) delete (voiture as Record<string, unknown>)[k];
  if (o.limite === undefined) delete voiture.limite;
  const etat = etatWith({
    [V.batterie]: String(o.batterie ?? 55), [V.autonomie]: String(o.autonomie ?? 210),
    [V.branchee]: o.branchee ?? 'on', [V.enCharge]: o.enCharge ?? 'off', [V.clim]: o.clim ?? 'off',
    ...(o.limite !== undefined ? { [V.limite]: String(o.limite) } : {}),
    ...(o.finCharge !== undefined ? { [V.finCharge]: o.finCharge } : {}),
  });
  return [frameWith(), screenWith({ etat, piece: pieceWith({ voiture }), climEnVol: o.climEnVol ?? null })];
}

const CARD = { key: 'voiture:sensor.b', type: 'voiture', rank: 4 } as const;

let agir: ReturnType<typeof vi.fn>;
let clim: ReturnType<typeof vi.fn>;
beforeEach(() => {
  agir = vi.fn(); clim = vi.fn();
  wireCardActions(agir);
  brancherVoiture({ clim });
});

describe('car card — detect', () => {
  it('unplugged under the limit waits for a gesture', () => {
    expect(detect(...car({ branchee: 'off', batterie: 42, limite: 80 })))
      .toEqual([{ key: 'voiture:sensor.b', type: 'voiture', rank: 2 }]);
  });
  it('no declared limit: never "plug in"', () => {
    expect(detect(...car({ branchee: 'off', batterie: 10 }))).toEqual([]);
  });
  it('charging runs on its own: rank 4', () => {
    expect(detect(...car({ enCharge: 'on', limite: 80 }))).toEqual([CARD]);
  });
  it('at or above the limit, or plugged in, nothing to do', () => {
    expect(detect(...car({ branchee: 'off', batterie: 80, limite: 80 }))).toEqual([]);
    expect(detect(...car({ branchee: 'on', batterie: 20, limite: 80 }))).toEqual([]);
  });
  it('a plug state the car does not publish is never read as unplugged', () => {
    expect(detect(...car({ branchee: 'unavailable', batterie: 20, limite: 80 }))).toEqual([]);
  });
  it('no car declared, no card', () => {
    expect(detect(frameWith(), screenWith({ etat: etatWith({}), piece: pieceWith() }))).toEqual([]);
  });
});

describe('car card — frame', () => {
  it('a missing action leaves its slot empty', () => {
    const [f, s] = car({ enCharge: 'on', sans: ['boutonLimite'] });
    expect(frame(CARD, f, s).buttons[0]).toBeUndefined();
  });

  it('charging: blue, the primary stops the charge', () => {
    const [f, s] = car({ enCharge: 'on', limite: 80 });
    const fr = frame(CARD, f, s);
    expect(fr.background).toEqual({ kind: 'solid', token: 'charging' });
    expect(fr.buttons[1]?.primary).toBe(true);
    fr.buttons[1]!.act();
    expect(agir).toHaveBeenCalledWith('button', 'press', V.arreterCharge);
  });

  it('to plug in: amber, the primary starts the charge', () => {
    const [f, s] = car({ branchee: 'off', batterie: 30, limite: 80 });
    const fr = frame({ ...CARD, rank: 2 }, f, s);
    expect(fr.background).toEqual({ kind: 'solid', token: 'plug-in' });
    fr.buttons[1]!.act();
    expect(agir).toHaveBeenCalledWith('button', 'press', V.demarrerCharge);
  });

  it('the limit button presses its own entity; no start or stop entity, no primary', () => {
    const [f, s] = car({ enCharge: 'on', sans: ['arreterCharge'] });
    const fr = frame(CARD, f, s);
    expect(fr.buttons[1]).toBeUndefined();
    fr.buttons[0]!.act();
    expect(agir).toHaveBeenCalledWith('button', 'press', V.boutonLimite);
  });

  it('the climate button keeps its optimistic flight: inert while an order is in flight', () => {
    const [f, s] = car({ enCharge: 'on', clim: 'off' });
    frame(CARD, f, s).buttons[2]!.act();
    expect(clim).toHaveBeenCalledWith(true);
    const [f2, s2] = car({ enCharge: 'on', climEnVol: 'demarrage' });
    expect(frame(CARD, f2, s2).buttons[2]?.inert).toBe(true);
  });

  it('charge and range large, the limit, and the end time read through Intl', () => {
    const end = new Date(T0 + 90 * 60_000).toISOString();
    const [f, s] = car({ enCharge: 'on', batterie: 64, autonomie: 230, limite: 80, finCharge: end });
    const fr = frame(CARD, f, s);
    const hote = document.createElement('div');
    render(fr.middle, hote);
    const pct = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'percent' });
    expect(hote.textContent).toContain(pct.format(64));
    expect(hote.textContent).toContain(pct.format(80));
    expect(hote.textContent).toContain(
      new Intl.NumberFormat(undefined, { style: 'unit', unit: 'kilometer' }).format(230));
    expect(fr.subtitle).toContain(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
      .format(new Date(end)));
  });

  it('an unreadable end time or range is left out, never shown as zero', () => {
    const [f, s] = car({ enCharge: 'on', finCharge: 'unknown' });
    const fr = frame(CARD, f, s);
    expect(fr.subtitle).toBeUndefined();
  });
});
