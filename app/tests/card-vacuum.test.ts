// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/vacuum';
import { wireCardActions } from '../src/cards/actions';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { newVacuumState } from '../src/boot/vacuum';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

const ROBOT = 'vacuum.robot';
const CARD = { key: `aspirateur:${ROBOT}`, type: 'aspirateur', rank: 4 } as const;

function vac(state: string, attrs: Record<string, unknown> = {}, over: Record<string, unknown> = {}): [Frame, ScreenState] {
  const etat = etatWith({ [ROBOT]: [state, { friendly_name: 'Robot', battery_level: 62, ...attrs }] });
  return [frameWith(), screenWith({ etat, piece: pieceWith({ aspirateur: ROBOT }), vacuum: newVacuumState(), ...over })];
}

let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });
afterEach(() => { location.hash = ''; });

describe('vacuum card — detect', () => {
  it('stuck is rank 2, cleaning rank 4', () => {
    expect(detect(...vac('error'))[0].rank).toBe(2);
    expect(detect(...vac('cleaning'))[0].rank).toBe(4);
    expect(detect(...vac('docked'))).toEqual([]);
  });
  it('returning runs on its own; paused waits for a gesture (its resume must stay reachable)', () => {
    expect(detect(...vac('returning'))).toEqual([CARD]);
    expect(detect(...vac('paused'))[0].rank).toBe(2);
  });
  it('a robot Home Assistant cannot read, or none declared, gives no card', () => {
    expect(detect(...vac('unavailable'))).toEqual([]);
    expect(detect(frameWith(), screenWith({ etat: etatWith({}), piece: pieceWith() }))).toEqual([]);
  });
});

describe('vacuum card — frame', () => {
  it('names the robot, its state and its battery', () => {
    const [f, s] = vac('cleaning');
    const fr = frame(CARD, f, s);
    expect(fr.title).toBe('Robot');
    expect(fr.background).toEqual({ kind: 'solid', token: 'neutral' });
    const hote = document.createElement('div');
    render(fr.middle, hote);
    expect(hote.textContent).toContain(new Intl.NumberFormat(undefined, { style: 'unit', unit: 'percent' }).format(62));
  });

  it('base, pause (primary) and the room choice while cleaning', () => {
    const [f, s] = vac('cleaning');
    const [base, main, rooms] = frame(CARD, f, s).buttons;
    base!.act(); expect(agir).toHaveBeenLastCalledWith('vacuum', 'return_to_base', ROBOT);
    expect(main?.primary).toBe(true);
    main!.act(); expect(agir).toHaveBeenLastCalledWith('vacuum', 'pause', ROBOT);
    expect(rooms?.icon).toBe('list');
  });

  it('stuck or paused: the primary resumes; returning: no base button, it is going there', () => {
    const [f, s] = vac('error');
    frame(CARD, f, s).buttons[1]!.act();
    expect(agir).toHaveBeenLastCalledWith('vacuum', 'start', ROBOT);
    const [f2, s2] = vac('returning');
    expect(frame(CARD, f2, s2).buttons[0]).toBeUndefined();
  });

  it('the rooms chosen from this tablet, when they are known', () => {
    const vacuum = { ...newVacuumState(), status: 'ready' as const,
      robots: [{ entite: ROBOT, nom: 'Robot', pieces: [{ zone: 'k', nom: 'Kitchen' }, { zone: 'b', nom: 'Bath' }],
                 passages: { min: 1, max: 1 } }],
      chosen: [{ entite: ROBOT, zone: 'b' }, { entite: 'vacuum.other', zone: 'k' }] };
    const [f, s] = vac('cleaning', {}, { vacuum });
    const hote = document.createElement('div');
    render(frame(CARD, f, s).middle, hote);
    expect(hote.textContent).toContain('Bath');
    expect(hote.textContent).not.toContain('Kitchen');
  });

  it('a battery the robot does not publish is left out, never shown as zero', () => {
    const [f, s] = vac('cleaning', { battery_level: undefined });
    const hote = document.createElement('div');
    render(frame(CARD, f, s).middle, hote);
    expect(hote.textContent).not.toMatch(/0\s*%/);
  });
});
