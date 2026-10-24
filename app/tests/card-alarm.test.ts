// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/alarm';
import { wireCardActions } from '../src/cards/actions';
import { S } from '../src/cards/strings';
import type { Appareil } from '../src/configuration';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

const IDS = ['alarm_control_panel.a_house', 'alarm_control_panel.a_garage', 'alarm_control_panel.a_shed'];
const CARD = { key: `alarme:${IDS[0]}`, type: 'alarme', rank: 5 } as const;
type Zone = [state: string, code?: string | null | undefined];

function alarm(zones: Zone[], room = 'Hall'): [ReturnType<typeof frameWith>, ScreenState] {
  const etat = etatWith(Object.fromEntries(zones.map(([st, code], i) =>
    [IDS[i], [st, { friendly_name: `Zone ${i}`, ...(code === undefined ? {} : { code_format: code }) }]])));
  const entites: Appareil['entites'] = { zones: IDS.slice(0, zones.length) };
  return [frameWith(), screenWith({ etat, piece: pieceWith({ nom: 'Hall' }), snoozed: new Set(), horsLigne: false,
    house: { sources: [], appareils: [{ type: 'alarme', piece: room, entites }] } })];
}
let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });
const text = (fr: ReturnType<typeof frame>) => { const h = document.createElement('div'); render(fr.middle, h); return h; };

describe('alarm card — detect', () => {
  it('rank 5 as soon as a zone is in any armed_* state', () => {
    for (const st of ['armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'armed_custom_bypass']) {
      expect(detect(...alarm([['disarmed'], [st]]))).toEqual([CARD]);
    }
  });
  it('disarmed, transitional, triggered and unreadable states are not armed', () => {
    for (const st of ['disarmed', 'arming', 'pending', 'disarming', 'triggered', 'unavailable', 'unknown']) {
      expect(detect(...alarm([[st]]))).toEqual([]);
    }
  });
  it('another room or the whole house: no card', () => {
    expect(detect(...alarm([['armed_away']], 'Elsewhere'))).toEqual([]);
    expect(detect(...alarm([['armed_away']], 'maison'))).toEqual([]);
  });
});

describe('alarm card — frame', () => {
  it('lists the armed zones by name, dir=auto', () => {
    const [f, s] = alarm([['armed_away', null], ['disarmed', null], ['armed_home', null]]);
    const rows = Array.from(text(frame(CARD, f, s)).querySelectorAll('[dir="auto"]')).map((r) => r.textContent);
    expect(rows).toEqual(['Zone 0', 'Zone 2']);
  });
  it('without a code the central button disarms the armed zones only', () => {
    const [f, s] = alarm([['armed_away', null], ['disarmed', null], ['armed_home', null]]);
    const b = frame(CARD, f, s).buttons;
    expect(b[0]).toBeUndefined();
    expect(b[2]).toBeUndefined();
    expect(b[1]!.primary).toBe(true);
    b[1]!.act();
    expect(agir.mock.calls).toEqual([
      ['alarm_control_panel', 'alarm_disarm', IDS[0]], ['alarm_control_panel', 'alarm_disarm', IDS[2]]]);
  });
  it('coded alarm has no disarm button, and the middle says so', () => {
    for (const code of ['number', 'text']) {
      const [f, s] = alarm([['armed_away', null], ['armed_home', code]]);
      const fr = frame(CARD, f, s);
      expect(fr.buttons).toEqual([undefined, undefined, undefined]);
      expect(text(fr).textContent).toContain(S.alarmCode);
    }
  });
  it('a code format that is not published is not "no code"', () => {
    const [f, s] = alarm([['armed_away', undefined]]);
    expect(frame(CARD, f, s).buttons[1]).toBeUndefined();
  });
  it('a disarmed zone with a code does not take the button away', () => {
    const [f, s] = alarm([['armed_away', null], ['disarmed', 'number']]);
    expect(frame(CARD, f, s).buttons[1]).toBeDefined();
  });
  it('offline: the button sends nothing through the shared action', () => {
    const [f, s] = alarm([['armed_away', null]]);
    expect(frame(CARD, f, s).background).toEqual({ kind: 'solid', token: 'neutral' });
  });
});
