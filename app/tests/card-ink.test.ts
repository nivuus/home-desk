// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/ink';
import { wireCardActions } from '../src/cards/actions';
import { S } from '../src/cards/strings';
import type { Appareil } from '../src/configuration';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

const IDS = ['sensor.i_black', 'sensor.i_cyan', 'sensor.i_magenta', 'sensor.i_yellow', 'sensor.i_photo', 'sensor.i_gray'];
const NAMES = ['Black', 'Cyan', 'Magenta', 'Yellow', 'Photo'];
const CARD = { key: `encre:${IDS[0]}`, type: 'encre', rank: 5 } as const;

type Opts = { levels?: string[]; seuil?: number; room?: string; names?: string[] };

/** An ink appliance of the room `Office`, threshold 15 by default; one sensor per level given. */
function ink(o: Opts = {}): [Frame, ScreenState, ReturnType<typeof vi.fn>] {
  const levels = o.levels ?? ['80', '10', '50'];
  const ids = IDS.slice(0, levels.length);
  const etat = etatWith(Object.fromEntries(levels.map((v, i) =>
    [ids[i], [v, { friendly_name: (o.names ?? NAMES)[i], unit_of_measurement: '%' }]])));
  const envoyerCommande = vi.fn(async () => null);
  const entites: Appareil['entites'] = { niveaux: ids };
  const house = { sources: [], appareils: [{ type: 'encre', piece: o.room ?? 'Office', entites, seuil: o.seuil ?? 15 }] };
  const s = screenWith({ etat, piece: pieceWith({ nom: 'Office' }), house, snoozed: new Set(), horsLigne: false,
    cx: { envoyerCommande }, dessiner: vi.fn() });
  return [frameWith(), s, envoyerCommande];
}
const two = (r: [Frame, ScreenState, unknown]) => [r[0], r[1]] as [Frame, ScreenState];
const bars = (r: [Frame, ScreenState, unknown]) => {
  const hote = document.createElement('div');
  render(frame(CARD, ...two(r)).middle, hote);
  return Array.from(hote.querySelectorAll<HTMLElement>('.jauge-ligne'));
};

let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });

describe('ink card — detect', () => {
  it('ink below threshold only', () => {
    expect(detect(...two(ink({ levels: ['80', '10', '50'] })))).toEqual([CARD]);
    expect(detect(...two(ink({ levels: ['80', '15', '50'] })))).toEqual([]);
    expect(detect(...two(ink({ levels: ['80', '90'] })))).toEqual([]);
  });
  it('the threshold is the appliance\'s own', () => {
    expect(detect(...two(ink({ levels: ['80', '30'], seuil: 40 })))).toHaveLength(1);
  });
  it('an unreadable level is absent, not empty', () => {
    expect(detect(...two(ink({ levels: ['80', 'unavailable', 'unknown'] })))).toEqual([]);
    expect(detect(...two(ink({ levels: ['unavailable', '5'] })))).toHaveLength(1);
  });
  it('the key comes from the first level entity, whatever its state', () => {
    expect(detect(...two(ink({ levels: ['unavailable', '5'] })))[0].key).toBe(`encre:${IDS[0]}`);
  });
  it('another room or the whole house: no card', () => {
    expect(detect(...two(ink({ levels: ['1'], room: 'Elsewhere' })))).toEqual([]);
    expect(detect(...two(ink({ levels: ['1'], room: 'maison' })))).toEqual([]);
  });
});

describe('ink card — frame', () => {
  it('one bar per readable level, named by the entity, dir=auto, width = the percentage', () => {
    const b = bars(ink({ levels: ['80', '10', 'unavailable', '50'] }));
    expect(b).toHaveLength(3);
    expect(b.map((x) => x.querySelector('[dir="auto"]')!.textContent)).toEqual(['Black', 'Cyan', 'Yellow']);
    expect(b[1].querySelector<HTMLElement>('.jauge-niveau')!.style.width).toBe('10%');
    expect(b[1].textContent).toContain(new Intl.NumberFormat(undefined, { style: 'unit', unit: 'percent' }).format(10));
  });
  it('names in CJK and Arabic go through untouched', () => {
    const names = ['黒インク — とても長い名前の', 'حبر أسود'];
    const b = bars(ink({ levels: ['5', '60'], names }));
    expect(b.map((x) => x.querySelector('[dir="auto"]')!.textContent)).toEqual(names);
  });
  it('a level out of 0-100 is drawn clamped', () => {
    expect(bars(ink({ levels: ['5', '140'] }))[1].querySelector<HTMLElement>('.jauge-niveau')!.style.width).toBe('100%');
  });
  it('more levels than the card has room for: the lowest keep their bar, in declared order', () => {
    const b = bars(ink({ levels: ['90', '10', '80', '20', '5', '70'], names: [...NAMES, 'Gray'] }));
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.querySelector('[dir="auto"]')!.textContent)).toEqual(['Cyan', 'Magenta', 'Yellow', 'Photo', 'Gray']);
  });
  it('hidden cartridges are counted in the subtitle, and the lowest are never the hidden ones', () => {
    const six = frame(CARD, ...two(ink({ levels: ['90', '10', '80', '20', '70', '5'], names: [...NAMES, 'Gray'] })));
    expect(six.subtitle).toBe(S.inkMore(new Intl.NumberFormat().format(1)));
    const hote = document.createElement('div');
    render(six.middle, hote);
    const names = Array.from(hote.querySelectorAll('[dir="auto"]')).map((n) => n.textContent);
    expect(names).toContain('Gray');
    expect(names).not.toContain('Black');
  });
  it('no subtitle while every cartridge has its bar', () => {
    expect(frame(CARD, ...two(ink({ levels: ['90', '10', '80', '20', '70'] }))).subtitle).toBeUndefined();
  });
  it('only the central button, which is later', () => {
    const fr = frame(CARD, ...two(ink()));
    expect(fr.buttons[0]).toBeUndefined();
    expect(fr.buttons[2]).toBeUndefined();
    expect(fr.buttons[1]!.icon).toBe('snooze');
    expect(fr.buttons[1]!.primary).toBe(true);
    expect(fr.background).toEqual({ kind: 'solid', token: 'neutral' });
  });
  it('a card of a gone appliance throws', () => {
    expect(() => frame(CARD, ...ink({ room: 'Elsewhere' }).slice(0, 2) as [Frame, ScreenState])).toThrow(/ink card/);
  });
});
