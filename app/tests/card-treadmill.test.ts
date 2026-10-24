// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/treadmill';
import { wireCardActions } from '../src/cards/actions';
import type { Appareil } from '../src/configuration';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

/** Fixture roles: invented entity ids, nothing of a real house. */
const R = {
  vitesse: 'sensor.t_speed', pas: 'sensor.t_steps', distance: 'sensor.t_distance',
  reglageVitesse: 'number.t_target', arret: 'button.t_stop',
};
const CARD = { key: `tapis:${R.vitesse}`, type: 'tapis', rank: 4 } as const;

type Opts = {
  speed?: string; sans?: (keyof typeof R)[]; room?: string; target?: string;
  targetAttrs?: Record<string, unknown>; states?: Record<string, string>; setting?: string;
};

function treadmill(o: Opts = {}): [Frame, ScreenState, ReturnType<typeof vi.fn>] {
  const entites: Appareil['entites'] = { ...R, ...(o.setting !== undefined ? { reglageVitesse: o.setting } : {}) };
  for (const k of o.sans ?? []) delete entites[k];
  const etat = etatWith({
    [R.vitesse]: [o.speed ?? '3.5', { unit_of_measurement: 'km/h' }],
    [R.pas]: ['4210', { unit_of_measurement: 'steps' }],
    [R.distance]: ['1.8', { unit_of_measurement: 'km' }],
    [o.setting ?? R.reglageVitesse]: [o.target ?? '3.5', o.targetAttrs ?? { step: 0.5, min: 1, max: 6 }],
    [R.arret]: 'unknown',
    ...(o.states ?? {}),
  });
  const envoyerCommande = vi.fn(async () => null);
  const house = { sources: [], appareils: [{ type: 'tapis', piece: o.room ?? 'Office', entites }] };
  const s = screenWith({ etat, piece: pieceWith({ nom: 'Office' }), house, snoozed: new Set(), horsLigne: false,
    cx: { envoyerCommande }, dessiner: vi.fn() });
  return [frameWith(), s, envoyerCommande];
}
const two = (r: [Frame, ScreenState, unknown]) => [r[0], r[1]] as [Frame, ScreenState];
const buttons = (o: Opts = {}) => frame(CARD, ...two(treadmill(o))).buttons;

let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });

describe('treadmill card — detect', () => {
  it('walking: rank 4, keyed by the speed entity', () => {
    expect(detect(...two(treadmill()))).toEqual([CARD]);
  });
  it.each(['0', '0.0', 'unavailable', 'unknown', 'abc'])('speed %s: no card', (speed) => {
    expect(detect(...two(treadmill({ speed })))).toEqual([]);
  });
  it('an appliance of another room or of the whole house does not show', () => {
    expect(detect(...two(treadmill({ room: 'Elsewhere' })))).toEqual([]);
    expect(detect(...two(treadmill({ room: 'maison' })))).toEqual([]);
  });
});

describe('treadmill card — frame', () => {
  it('speed, steps and distance in the middle, through Intl, with the unit of the entity', () => {
    const [f, s] = two(treadmill());
    const hote = document.createElement('div');
    render(frame(CARD, f, s).middle, hote);
    const text = hote.textContent!;
    expect(text).toContain(new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(3.5));
    expect(text).toContain('km/h');
    expect(text).toContain(new Intl.NumberFormat().format(4210));
    expect(text).toContain('steps');
    expect(text).toContain('km');
  });
  it('a missing or unreadable steps/distance leaves no line, and no duration is ever drawn', () => {
    const [f, s] = two(treadmill({ sans: ['pas', 'distance'] }));
    const hote = document.createElement('div');
    render(frame(CARD, f, s).middle, hote);
    expect(hote.querySelectorAll('.carte-ligne')).toHaveLength(0);
    const [f2, s2] = two(treadmill({ states: { [R.pas]: 'unavailable', [R.distance]: 'unknown' } }));
    render(frame(CARD, f2, s2).middle, hote);
    expect(hote.querySelectorAll('.carte-ligne')).toHaveLength(0);
  });
  it('slower · stop (primary) · faster, on the neutral solid', () => {
    const fr = frame(CARD, ...two(treadmill()));
    expect(fr.buttons.map((b) => b?.icon)).toEqual(['moins', 'stop', 'plus']);
    expect(fr.buttons.map((b) => b?.primary)).toEqual([undefined, true, undefined]);
    expect(fr.background).toEqual({ kind: 'solid', token: 'neutral' });
  });
  it('speed step comes from the entity', () => {
    const b = buttons({ targetAttrs: { step: 0.25, min: 1, max: 6 } });
    b[2]!.act();
    expect(agir).toHaveBeenLastCalledWith('number', 'set_value', R.reglageVitesse, { value: 3.75 });
    b[0]!.act();
    expect(agir).toHaveBeenLastCalledWith('number', 'set_value', R.reglageVitesse, { value: 3.25 });
  });
  it('the service domain follows the entity: input_number too', () => {
    buttons({ setting: 'input_number.t_target' })[2]!.act();
    expect(agir).toHaveBeenLastCalledWith('input_number', 'set_value', 'input_number.t_target', { value: 4 });
  });
  it('a step is clamped to the bounds, and the button at its bound is an empty slot', () => {
    const top = buttons({ target: '5.8' });
    top[2]!.act();
    expect(agir).toHaveBeenLastCalledWith('number', 'set_value', R.reglageVitesse, { value: 6 });
    expect(buttons({ target: '6' })[2]).toBeUndefined();
    expect(buttons({ target: '6' })[0]).toBeDefined();
    expect(buttons({ target: '1' })[0]).toBeUndefined();
    expect(buttons({ target: '1' })[2]).toBeDefined();
  });
  it('floating point does not leak into the value sent', () => {
    buttons({ target: '0.2', targetAttrs: { step: 0.1, min: 0, max: 6 } })[2]!.act();
    expect(agir).toHaveBeenLastCalledWith('number', 'set_value', R.reglageVitesse, { value: 0.3 });
  });
  it.each([{ min: 1, max: 6 }, { step: 0.5, max: 6 }, { step: 0.5, min: 1 }, { step: 'x', min: 1, max: 6 },
    { step: 0, min: 1, max: 6 }])('step, min or max missing or not numeric (%j): both step slots stay empty', (attrs) => {
    const b = buttons({ targetAttrs: attrs });
    expect(b[0]).toBeUndefined();
    expect(b[2]).toBeUndefined();
    expect(b[1]).toBeDefined();
  });
  it('no setting role, or an unreadable one: both step slots stay empty', () => {
    expect(buttons({ sans: ['reglageVitesse'] }).filter((b) => b !== undefined)).toHaveLength(1);
    const b = buttons({ states: { [R.reglageVitesse]: 'unavailable' } });
    expect([b[0], b[2]]).toEqual([undefined, undefined]);
  });
  it('stop presses the button entity; without one, or unavailable, the slot is empty', () => {
    buttons()[1]!.act();
    expect(agir).toHaveBeenLastCalledWith('button', 'press', R.arret);
    expect(buttons({ sans: ['arret'] })[1]).toBeUndefined();
    expect(buttons({ states: { [R.arret]: 'unavailable' } })[1]).toBeUndefined();
  });
  it('the name of nothing from Home Assistant is hardcoded: a card of a gone appliance throws', () => {
    const [f, s] = treadmill({ room: 'Elsewhere' });
    expect(() => frame(CARD, f, s)).toThrow(/treadmill card/);
  });
});
