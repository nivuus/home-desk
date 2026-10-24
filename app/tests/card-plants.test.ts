// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/plants';
import { wireCardActions } from '../src/cards/actions';
import type { Appareil } from '../src/configuration';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

/** Fixture ids: invented, nothing of a real house. */
const PROBES = ['sensor.p_ficus', 'sensor.p_fern', 'sensor.p_cactus'];
const HABIT = 'input_boolean.p_done';
const CARD = { key: `plantes:${PROBES[0]}`, type: 'plantes', rank: 5 } as const;

type Probe = [string, Record<string, unknown>?];
type Opts = {
  probes?: Probe[]; seuil?: number; habitude?: string | null; room?: string; commandes?: unknown[];
  states?: Record<string, string>;
};

/** A plants appliance of the room `Office`: by default two probes at 40 / 10, threshold 20. */
function plants(o: Opts = {}): [Frame, ScreenState, ReturnType<typeof vi.fn>] {
  const probes = o.probes ?? [['40', { friendly_name: 'Ficus' }], ['10', { friendly_name: 'Fern' }]];
  const ids = PROBES.slice(0, probes.length);
  const entites: Appareil['entites'] = { sondes: ids, ...(o.habitude === null ? {} : { habitude: HABIT }) };
  const etat = etatWith({
    ...Object.fromEntries(probes.map(([v, a], i) => [ids[i], [v, a ?? {}]])),
    [HABIT]: o.habitude ?? 'off',
    ...(o.states ?? {}),
  });
  const envoyerCommande = vi.fn(async () => null);
  const appliance: Appareil = { type: 'plantes', piece: o.room ?? 'Office', entites,
    ...(o.seuil !== undefined ? { seuil: o.seuil } : { seuil: 20 }) };
  const s = screenWith({ etat, piece: pieceWith({ nom: 'Office', commandes: o.commandes ?? [] }),
    house: { sources: [], appareils: [appliance] }, snoozed: new Set(), horsLigne: false,
    cx: { envoyerCommande }, dessiner: vi.fn() });
  return [frameWith(), s, envoyerCommande];
}
const two = (r: [Frame, ScreenState, unknown]) => [r[0], r[1]] as [Frame, ScreenState];

const gauges = (r: [Frame, ScreenState, unknown]) => {
  const hote = document.createElement('div');
  render(frame(CARD, ...two(r)).middle, hote);
  return Array.from(hote.querySelectorAll<HTMLElement>('.jauge'));
};

let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });

describe('plants card — detect', () => {
  it('a probe under its threshold: rank 5, keyed on the first probe', () => {
    expect(detect(...two(plants()))).toEqual([CARD]);
  });
  it('the key does not move with the readings or with which probe is dry', () => {
    const dryFirst = plants({ probes: [['5', {}], ['50', {}]] });
    expect(detect(...two(dryFirst))[0].key).toBe(CARD.key);
  });
  it('the threshold is strict: at the threshold, nothing', () => {
    expect(detect(...two(plants({ probes: [['20', {}], ['25', {}]] })))).toEqual([]);
    expect(detect(...two(plants({ probes: [['19.9', {}]] })))).toHaveLength(1);
  });
  it('a probe with soil_warning uses it, not the seuil', () => {
    const r = plants({ probes: [['25', { soil_warning: 30 }]], seuil: 10 });
    expect(detect(...two(r))).toHaveLength(1);
    const r2 = plants({ probes: [['25', { soil_warning: 20 }]], seuil: 90 });
    expect(detect(...two(r2))).toEqual([]);
  });
  it('a probe without soil_warning uses seuil', () => {
    expect(detect(...two(plants({ probes: [['25', {}]], seuil: 30 })))).toHaveLength(1);
    expect(detect(...two(plants({ probes: [['25', {}]], seuil: 20 })))).toEqual([]);
  });
  it('no soil_warning and no seuil: the probe is not judged', () => {
    const [f, s] = plants({ probes: [['1', {}]] });
    delete s.house.appareils[0].seuil;
    expect(detect(f, s)).toEqual([]);
  });
  it('an unavailable, unknown or non-numeric probe is absent, not dry', () => {
    for (const v of ['unavailable', 'unknown', 'abc', '']) {
      expect(detect(...two(plants({ probes: [[v, {}]] }))), v).toEqual([]);
    }
  });
  it('a house plant of another room does not show; one of the whole house never does (rank 5)', () => {
    expect(detect(...two(plants({ room: 'Elsewhere' })))).toEqual([]);
    expect(detect(...two(plants({ room: 'maison' })))).toEqual([]);
  });
});

describe('plants card — frame', () => {
  it('one gauge per probe under its threshold, none for the others', () => {
    const g = gauges(plants({ probes: [['40', { friendly_name: 'Ficus' }], ['10', { friendly_name: 'Fern' }],
      ['5', { friendly_name: 'Cactus' }]] }));
    expect(g).toHaveLength(2);
    const names = g.map((x) => x.querySelector('[dir="auto"]')!.textContent);
    expect(names).toContain('Fern');
    expect(names).toContain('Cactus');
    expect(names).not.toContain('Ficus');
  });
  it('the label is the entity friendly name in any script, dir=auto; the value through Intl', () => {
    const [g] = gauges(plants({ probes: [['12', { friendly_name: 'シダ — 玄関の鉢植え' }]] }));
    expect(g.querySelector('[dir="auto"]')!.textContent).toBe('シダ — 玄関の鉢植え');
    expect(g.textContent).toContain(new Intl.NumberFormat(undefined, { style: 'unit', unit: 'percent' }).format(12));
  });
  it('the gauge fills to the reading', () => {
    const [g] = gauges(plants({ probes: [['12', {}]] }));
    expect(g.querySelector<HTMLElement>('.jauge-niveau')!.getAttribute('style')).toContain('12%');
  });
  it('a reading past 0..100 stays inside the track', () => {
    const [g] = gauges(plants({ probes: [['-4', {}]], seuil: 20 }));
    expect(g.querySelector<HTMLElement>('.jauge-niveau')!.getAttribute('style')).toContain('0%');
  });
  it('later (plain) · watered (primary) · empty details, on a solid colour', () => {
    const fr = frame(CARD, ...two(plants()));
    expect(fr.buttons.map((b) => b?.icon)).toEqual(['snooze', 'arrosoir', undefined]);
    expect(fr.buttons.map((b) => b?.primary)).toEqual([undefined, true, undefined]);
    expect(fr.background.kind).toBe('solid');
  });
  it('watered calls the habit then hides', () => {
    const r = plants();
    frame(CARD, ...two(r)).buttons[1]!.act();
    expect(agir).toHaveBeenCalledTimes(1);
    expect(agir).toHaveBeenLastCalledWith('input_boolean', 'turn_on', HABIT);
    expect(r[2]).toHaveBeenCalledWith({ type: 'home_desk/plus_tard', cle: CARD.key });
  });
  it('without a habit, or with an unusable one, watered is just later', () => {
    for (const r of [plants({ habitude: null }), plants({ states: { [HABIT]: 'unavailable' } })]) {
      frame(CARD, ...two(r)).buttons[1]!.act();
      expect(agir).not.toHaveBeenCalled();
      expect(r[2]).toHaveBeenCalledTimes(1);
    }
  });
  it('details open the plants view only when the screen declares one', () => {
    const view = { libelle: 'Plantes', icone: 'list', entite: 'sensor.x', vue: '#plantes' };
    const r = plants({ commandes: [view] });
    const b = frame(CARD, ...two(r)).buttons[2]!;
    expect(b.icon).toBe('list');
    location.hash = '';
    b.act();
    expect(location.hash).toBe('#plantes');
    expect(frame(CARD, ...two(plants({ commandes: [{ ...view, vue: '#taches' }] }))).buttons[2]).toBeUndefined();
  });
  it('more dry plants than room: the driest first, the rest counted', () => {
    const probes: Probe[] = [['9', { friendly_name: 'A' }], ['3', { friendly_name: 'B' }], ['6', { friendly_name: 'C' }]];
    const r = plants({ probes });
    const names = gauges(r).map((x) => x.querySelector('[dir="auto"]')!.textContent);
    expect(names).toEqual(['B', 'C', 'A']);
  });
});
