// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/pets';
import { wireCardActions } from '../src/cards/actions';
import { renderCardFrame } from '../src/rendu/card-frame';
import type { Appareil } from '../src/configuration';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

/** Fixture roles: invented entity ids, nothing of a real house. */
const R = {
  fontaineVide: 'binary_sensor.p_empty', filtre: 'binary_sensor.p_filter', panneFontaine: 'binary_sensor.p_fault',
  panneDistributeur: 'binary_sensor.p_feeder_fault', joursFiltre: 'sensor.p_filter_days', nourrir: 'number.p_feed',
};
const CARD = { key: `animaux:${R.fontaineVide}`, type: 'animaux', rank: 2 } as const;

type Opts = {
  on?: (keyof typeof R)[]; sans?: (keyof typeof R)[]; states?: Record<string, string>; min?: unknown;
  room?: string; name?: string;
};

/** A pets appliance of the room `Office`; the roles in `on` raise their problem. */
function pets(o: Opts = {}): [Frame, ScreenState, ReturnType<typeof vi.fn>] {
  const entites: Appareil['entites'] = { ...R };
  for (const k of o.sans ?? []) delete entites[k];
  const on = o.on ?? [];
  const attrs = (n: string) => ({ friendly_name: o.name ?? n });
  const etat = etatWith({
    [R.fontaineVide]: [on.includes('fontaineVide') ? 'on' : 'off', attrs('Fountain')],
    [R.filtre]: [on.includes('filtre') ? 'on' : 'off', attrs('Filter')],
    [R.panneFontaine]: [on.includes('panneFontaine') ? 'on' : 'off', attrs('Fountain pump')],
    [R.panneDistributeur]: [on.includes('panneDistributeur') ? 'on' : 'off', attrs('Feeder')],
    [R.joursFiltre]: '3',
    [R.nourrir]: ['5', o.min === undefined ? { min: 20 } : o.min === null ? {} : { min: o.min }],
    ...Object.fromEntries(Object.entries(o.states ?? {}).map(([k, v]) => [k, v])),
  });
  const envoyerCommande = vi.fn(async () => null);
  const house = { sources: [], appareils: [{ type: 'animaux', piece: o.room ?? 'Office', entites }] };
  const s = screenWith({ etat, piece: pieceWith({ nom: 'Office' }), house, snoozed: new Set(), horsLigne: false,
    cx: { envoyerCommande }, dessiner: vi.fn() });
  return [frameWith(), s, envoyerCommande];
}

const lines = (fs: [Frame, ScreenState, unknown], card: typeof CARD = CARD) => {
  const hote = document.createElement('div');
  render(frame(card, fs[0], fs[1]).middle, hote);
  return Array.from(hote.querySelectorAll('.carte-ligne')).map((l) => l.textContent!.trim());
};

let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });

describe('pets card — detect', () => {
  it('no problem, no card', () => {
    expect(detect(...pets().slice(0, 2) as [Frame, ScreenState])).toEqual([]);
  });
  it.each(['fontaineVide', 'filtre', 'panneFontaine', 'panneDistributeur'] as const)('%s raised: rank 2', (role) => {
    const [f, s] = pets({ on: [role] });
    expect(detect(f, s)).toHaveLength(1);
    expect(detect(f, s)[0].rank).toBe(2);
    expect(detect(f, s)[0].type).toBe('animaux');
  });
  it('the key comes from the first declared role entity, never from a state', () => {
    const [f, s] = pets({ on: ['filtre'] });
    expect(detect(f, s)[0].key).toBe(`animaux:${R.fontaineVide}`);
    const [f2, s2] = pets({ on: ['panneDistributeur'], sans: ['fontaineVide', 'filtre', 'panneFontaine'] });
    expect(detect(f2, s2)[0].key).toBe(`animaux:${R.panneDistributeur}`);
  });
  it('an unavailable or unknown role is no problem: absent', () => {
    for (const st of ['unavailable', 'unknown']) {
      const [f, s] = pets({ states: { [R.fontaineVide]: st, [R.filtre]: st, [R.panneFontaine]: st, [R.panneDistributeur]: st } });
      expect(detect(f, s), st).toEqual([]);
    }
  });
  it('an appliance of the whole house shows (rank 2 always), one of another room does not', () => {
    expect(detect(...pets({ on: ['fontaineVide'], room: 'maison' }).slice(0, 2) as [Frame, ScreenState])).toHaveLength(1);
    expect(detect(...pets({ on: ['fontaineVide'], room: 'Elsewhere' }).slice(0, 2) as [Frame, ScreenState])).toEqual([]);
  });
});

describe('pets card — frame', () => {
  it('one line per active problem; a line of a role that is not raised does not appear', () => {
    expect(lines(pets({ on: ['fontaineVide', 'panneDistributeur'] }))).toHaveLength(2);
    expect(lines(pets({ on: ['panneFontaine'] }))).toHaveLength(1);
  });
  it('the line carries the entity friendly name, dir=auto, in any script', () => {
    const fs = pets({ on: ['fontaineVide'], name: '猫の給水器 — 二階の廊下' });
    const hote = document.createElement('div');
    render(frame(CARD, fs[0], fs[1]).middle, hote);
    const name = hote.querySelector('[dir="auto"]')!;
    expect(name.textContent).toBe('猫の給水器 — 二階の廊下');
  });
  it('the filter line adds its days left, through Intl', () => {
    const text = lines(pets({ on: ['filtre'] }))[0];
    expect(text).toContain(new Intl.NumberFormat(undefined, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(3));
  });
  it('no days role, or unreadable days, no days', () => {
    const noDays = lines(pets({ on: ['filtre'], sans: ['joursFiltre'] }))[0];
    const unknown = lines(pets({ on: ['filtre'], states: { [R.joursFiltre]: 'unknown' } }))[0];
    expect(noDays).toBe(unknown);
  });
  it('feed · done (primary) · later, the card on the calm solid', () => {
    const fr = frame(CARD, ...pets({ on: ['fontaineVide'] }).slice(0, 2) as [Frame, ScreenState]);
    expect(fr.buttons.map((b) => b?.icon)).toEqual(['gamelle', 'coche', 'snooze']);
    expect(fr.buttons.map((b) => b?.primary)).toEqual([undefined, true, undefined]);
    expect(fr.background).toEqual({ kind: 'solid', token: 'calm' });
  });
  it('feed calls number.set_value with the min of the entity, never a portion of ours', () => {
    const [f, s] = pets({ on: ['fontaineVide'], min: 35 });
    frame(CARD, f, s).buttons[0]!.act();
    expect(agir).toHaveBeenLastCalledWith('number', 'set_value', R.nourrir, { value: 35 });
  });
  it('no min, or a min that is not a number: the feed slot stays empty', () => {
    for (const min of [null, 'abc', '']) {
      const [f, s] = pets({ on: ['fontaineVide'], min });
      const b = frame(CARD, f, s).buttons;
      expect(b[0], String(min)).toBeUndefined();
      expect(b[1]).toBeDefined();
    }
  });
  it('no feed role, or an unavailable one: the feed slot stays empty', () => {
    expect(frame(CARD, ...pets({ on: ['filtre'], sans: ['nourrir'] }).slice(0, 2) as [Frame, ScreenState]).buttons[0]).toBeUndefined();
    const [f, s] = pets({ on: ['filtre'], states: { [R.nourrir]: 'unavailable' } });
    expect(frame(CARD, f, s).buttons[0]).toBeUndefined();
  });
  it('fountain fixed by hand: done means later', () => {
    const [f, s, envoyerCommande] = pets({ on: ['fontaineVide'] });
    const [, done, later] = frame(CARD, f, s).buttons;
    done!.act();
    expect(agir).not.toHaveBeenCalled();
    expect(envoyerCommande).toHaveBeenCalledTimes(1);
    expect(envoyerCommande).toHaveBeenLastCalledWith({ type: 'home_desk/plus_tard', cle: CARD.key });
    later!.act();
    expect(envoyerCommande).toHaveBeenCalledTimes(2);
    expect(envoyerCommande).toHaveBeenLastCalledWith({ type: 'home_desk/plus_tard', cle: CARD.key });
  });
  it('renders in the frame with the label and the title', () => {
    const fs = pets({ on: ['fontaineVide'] });
    const hote = document.createElement('div');
    render(renderCardFrame(frame(CARD, fs[0], fs[1])), hote);
    expect(hote.querySelectorAll('button, [role="button"]').length).toBeGreaterThan(0);
  });
  it('a card whose appliance is gone throws, as the other cards do', () => {
    const [f, s] = pets({ on: ['fontaineVide'], room: 'Elsewhere' });
    expect(() => frame(CARD, f, s)).toThrow(/pets card/);
  });
});
