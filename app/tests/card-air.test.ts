// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/air';
import { wireCardActions } from '../src/cards/actions';
import type { Appareil } from '../src/configuration';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

const R = { pm25: 'sensor.a_pm25', purificateur: 'fan.a_purifier' };
const CARD = { key: `air:${R.pm25}`, type: 'air', rank: 5 } as const;

type Opts = {
  pm?: string; seuil?: number; fan?: string; fanAttrs?: Record<string, unknown>; room?: string;
  states?: Record<string, string>; sans?: (keyof typeof R)[];
};

/** An air appliance of the room `Office`, threshold 25 by default. */
function air(o: Opts = {}): [Frame, ScreenState, ReturnType<typeof vi.fn>] {
  const entites: Appareil['entites'] = { ...R };
  for (const k of o.sans ?? []) delete entites[k];
  const etat = etatWith({
    [R.pm25]: [o.pm ?? '40', { unit_of_measurement: 'µg/m³' }],
    [R.purificateur]: [o.fan ?? 'on',
      o.fanAttrs ?? { preset_modes: ['Auto', 'Silent', 'Favorite'], percentage: 60 }],
    ...(o.states ?? {}),
  });
  const envoyerCommande = vi.fn(async () => null);
  const house = { sources: [], appareils: [{ type: 'air', piece: o.room ?? 'Office', entites, seuil: o.seuil ?? 25 }] };
  const s = screenWith({ etat, piece: pieceWith({ nom: 'Office' }), house, snoozed: new Set(), horsLigne: false,
    cx: { envoyerCommande }, dessiner: vi.fn() });
  return [frameWith(), s, envoyerCommande];
}
const two = (r: [Frame, ScreenState, unknown]) => [r[0], r[1]] as [Frame, ScreenState];
const buttons = (o: Opts = {}) => frame(CARD, ...two(air(o))).buttons;

let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });

describe('air card — detect', () => {
  it('above the threshold: rank 5, keyed by the pm25 entity', () => {
    expect(detect(...two(air()))).toEqual([CARD]);
  });
  it('at or under the threshold, or unreadable: no card', () => {
    for (const pm of ['25', '10', 'unavailable', 'unknown', 'abc']) expect(detect(...two(air({ pm }))), pm).toEqual([]);
  });
  it('the threshold is the appliance\'s own', () => {
    expect(detect(...two(air({ pm: '40', seuil: 50 })))).toEqual([]);
    expect(detect(...two(air({ pm: '40', seuil: 39.5 })))).toHaveLength(1);
  });
  it('another room or the whole house: no card (a soft reminder)', () => {
    expect(detect(...two(air({ room: 'Elsewhere' })))).toEqual([]);
    expect(detect(...two(air({ room: 'maison' })))).toEqual([]);
  });
});

describe('air card — frame', () => {
  it('the reading and the motor speed through Intl, on air-bad', () => {
    const [f, s] = two(air());
    const fr = frame(CARD, f, s);
    const hote = document.createElement('div');
    render(fr.middle, hote);
    expect(hote.textContent).toContain(new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(40));
    expect(hote.textContent).toContain('µg/m³');
    expect(hote.textContent).toContain(new Intl.NumberFormat(undefined, { style: 'unit', unit: 'percent' }).format(60));
    expect(fr.background).toEqual({ kind: 'solid', token: 'air-bad' });
  });
  it('no motor percentage, no motor line', () => {
    const [f, s] = two(air({ fanAttrs: { preset_modes: ['Favorite'] } }));
    const hote = document.createElement('div');
    render(frame(CARD, f, s).middle, hote);
    expect(hote.textContent).not.toContain('%');
  });
  it('later · toggle (primary) · favourite', () => {
    const fr = frame(CARD, ...two(air()));
    expect(fr.buttons.map((b) => b?.icon)).toEqual(['snooze', 'purificateur', 'etoile']);
    expect(fr.buttons.map((b) => b?.primary)).toEqual([undefined, true, undefined]);
  });
  it('toggle calls fan.toggle', () => {
    buttons()[1]!.act();
    expect(agir).toHaveBeenLastCalledWith('fan', 'toggle', R.purificateur);
  });
  it('the toggle label says what it will do', () => {
    expect(buttons({ fan: 'on' })[1]!.label).not.toBe(buttons({ fan: 'off' })[1]!.label);
  });
  it('favourite sets the preset the entity itself lists', () => {
    buttons()[2]!.act();
    expect(agir).toHaveBeenLastCalledWith('fan', 'set_preset_mode', R.purificateur, { preset_mode: 'Favorite' });
  });
  it('no favourite preset, empty slot', () => {
    for (const fanAttrs of [{ preset_modes: ['Auto', 'Silent'] }, {}, { preset_modes: 'Favorite' }]) {
      const b = buttons({ fanAttrs });
      expect(b[2], JSON.stringify(fanAttrs)).toBeUndefined();
      expect(b[1]).toBeDefined();
    }
  });
  it('an unavailable purifier leaves toggle and favourite empty; later stays', () => {
    const b = buttons({ states: { [R.purificateur]: 'unavailable' } });
    expect(b[0]!.icon).toBe('snooze');
    expect([b[1], b[2]]).toEqual([undefined, undefined]);
  });
  it('a card of a gone appliance throws', () => {
    const [f, s] = air({ room: 'Elsewhere' });
    expect(() => frame(CARD, f, s)).toThrow(/air card/);
  });
});
