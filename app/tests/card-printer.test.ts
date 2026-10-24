// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/printer';
import { CAMERA_HOLD } from '../src/cards/printer-camera';
import { wireCardActions } from '../src/cards/actions';
import { renderCardFrame } from '../src/rendu/card-frame';
import { cardPress } from '../src/stack/swipe';
import { SEUIL_PX } from '../src/geste';
import type { Appareil } from '../src/configuration';
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith, T0 } from './card-aides';

/** Fixture roles: invented entity ids, nothing of a real house. */
const R = {
  etat: 'sensor.p_status', progression: 'sensor.p_progress', finTache: 'sensor.p_end',
  couche: 'sensor.p_layer', couchesTotal: 'sensor.p_layers', tache: 'sensor.p_task',
  couverture: 'image.p_cover', camera: 'camera.p_chamber', pause: 'button.p_pause',
  reprise: 'button.p_resume', arret: 'button.p_stop', erreur: 'binary_sensor.p_error',
};
const TRAYS = ['sensor.p_tray_1', 'sensor.p_tray_2', 'sensor.p_tray_3', 'sensor.p_tray_4'];
const CARD = { key: `imprimante:${R.etat}`, type: 'imprimante', rank: 4 } as const;

type Opts = {
  status?: string; error?: string; sans?: (keyof typeof R | 'ams')[]; task?: string;
  buttons?: string; trays?: [string, Record<string, unknown>][]; room?: string;
};

/** A printer of the room `Office`, every role declared unless listed in `sans`. `buttons` is the
 *  state of the three button entities: ha-bambulab marks each `unavailable` outside the print
 *  states it acts in. */
function printer(o: Opts = {}): [Frame, ScreenState] {
  const entites: Appareil['entites'] = { ...R, ams: TRAYS };
  for (const k of o.sans ?? []) delete entites[k];
  const b = o.buttons ?? 'unknown';
  const trays = o.trays ?? [
    ['PLA Basic', { color: '#FF6A13FF', empty: false, active: false }],
    ['PETG', { color: '#0A2CA5FF', empty: false, active: true }],
    ['Empty', { color: '#00000000', empty: true, active: false }],
    ['PLA Matte', { color: '#FFFFFFFF', empty: false, active: false }],
  ];
  const etat = etatWith({
    [R.etat]: o.status ?? 'running', [R.progression]: '42', [R.finTache]: new Date(T0 + 95 * 60_000).toISOString(),
    [R.couche]: '120', [R.couchesTotal]: '300', [R.tache]: o.task ?? 'Benchy',
    [R.couverture]: ['2026-08-01T12:00:00+00:00', { entity_picture: '/api/image_proxy/image.p_cover?token=a' }],
    [R.camera]: ['idle', { entity_picture: '/api/camera_proxy/camera.p_chamber?token=b' }],
    [R.pause]: b, [R.reprise]: b, [R.arret]: b,
    [R.erreur]: [o.error ?? 'off', { code: '0700_8011', error: 'AMS slot 1 has run out of filament.' }],
    ...Object.fromEntries(trays.map(([state, attrs], i) => [TRAYS[i], [state, attrs]])),
  });
  const house = { sources: [], appareils: [{ type: 'imprimante', piece: o.room ?? 'Office', entites }] };
  return [frameWith(), screenWith({ etat, piece: pieceWith({ nom: 'Office' }), house, snoozed: new Set(),
    horsLigne: true, dessiner: vi.fn() })];
}

const rank = (o: Opts) => detect(...printer(o)).map((c) => c.rank);
const middle = (fs: [Frame, ScreenState]) => {
  const hote = document.createElement('div');
  render(frame(CARD, ...fs).middle, hote);
  return hote;
};

let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); });

describe('printer card — detect (print_status values of ha-bambulab)', () => {
  it('printing, preparing, slicing and paused run on their own: rank 4', () => {
    for (const status of ['running', 'prepare', 'slicing', 'pause']) expect(rank({ status }), status).toEqual([4]);
  });
  it('a finished print not removed yet, or a failed one, waits for a gesture: rank 2', () => {
    expect(detect(...printer({ status: 'finish' }))).toEqual([{ ...CARD, rank: 2 }]);
    expect(rank({ status: 'failed' })).toEqual([2]);
  });
  it('a print error during a job (filament run out) waits for a gesture: rank 2', () => {
    expect(rank({ status: 'pause', error: 'on' })).toEqual([2]);
    expect(rank({ status: 'running', error: 'on' })).toEqual([2]);
  });
  it('at rest, offline, or unreadable: no card, not even with a stale error', () => {
    for (const status of ['idle', 'init', 'offline', 'unknown', 'unavailable']) {
      expect(rank({ status, error: 'on' }), status).toEqual([]);
    }
  });
  it('an unreadable error sensor is no fault: the print keeps its own rank', () => {
    expect(rank({ status: 'running', error: 'unavailable' })).toEqual([4]);
  });
  it('a printer of the whole house shows on every tablet only while it waits for a gesture', () => {
    expect(rank({ status: 'running', room: 'maison' })).toEqual([]);
    expect(rank({ status: 'finish', room: 'maison' })).toEqual([2]);
  });
});

describe('printer card — frame', () => {
  it('the percentage large, the end time through Intl, the layer n / total', () => {
    const text = middle(printer()).textContent!;
    expect(text).toContain(new Intl.NumberFormat(undefined, { style: 'unit', unit: 'percent' }).format(42));
    expect(text).toContain(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
      .format(new Date(T0 + 95 * 60_000)));
    const n = new Intl.NumberFormat();
    expect(text).toContain(`${n.format(120)} / ${n.format(300)}`);
  });

  it('AMS: the active spool is larger', () => {
    const spools = Array.from(middle(printer()).querySelectorAll<HTMLElement>('.bobine'));
    expect(spools).toHaveLength(4);
    expect(spools.map((s) => s.classList.contains('en-cours'))).toEqual([false, true, false, false]);
    expect(spools[1].getAttribute('aria-current')).toBe('true');
  });

  it('AMS: each spool its colour, an empty tray an empty ring, a colour that is not one dropped', () => {
    const hote = middle(printer({ trays: [
      ['PLA', { color: '#FF6A13FF', empty: false, active: false }],
      ['Empty', { color: '#00000000', empty: true, active: false }],
      ['Odd', { color: "red;background:url('x')", empty: false, active: false }],
    ] }));
    const [orange, empty, odd] = Array.from(hote.querySelectorAll<HTMLElement>('.bobine'));
    expect(orange.getAttribute('style')).toContain('--bobine:#FF6A13');
    expect(empty.classList.contains('vide')).toBe(true);
    expect(empty.getAttribute('style') ?? '').not.toContain('--bobine:');
    expect(odd.classList.contains('vide')).toBe(true);
    expect(odd.getAttribute('style') ?? '').not.toContain('url');
  });

  it('a light spool gets a dark inner ring and a dark spool a light one', () => {
    const hote = middle(printer({ trays: [
      ['White', { color: '#FFFFFFFF', empty: false, active: false }],
      ['Black', { color: '#000000FF', empty: false, active: false }],
    ] }));
    const [white, black] = Array.from(hote.querySelectorAll<HTMLElement>('.bobine'));
    expect(white.getAttribute('style')).toContain('--bobine-bord:#000000');
    expect(black.getAttribute('style')).toContain('--bobine-bord:#ffffff');
  });

  it('no AMS declared, no spool row', () => {
    expect(middle(printer({ sans: ['ams'] })).querySelector('.bobines')).toBeNull();
  });

  it('camera · pause (primary) · stop while printing, each a button.press', () => {
    const [cam, main, stop] = frame(CARD, ...printer({ buttons: 'unknown' })).buttons;
    expect(cam?.icon).toBe('camera');
    expect(main?.primary).toBe(true);
    main!.act(); expect(agir).toHaveBeenLastCalledWith('button', 'press', R.pause);
    stop!.act(); expect(agir).toHaveBeenLastCalledWith('button', 'press', R.arret);
  });

  it('paused: the primary resumes', () => {
    const [, main] = frame(CARD, ...printer({ status: 'pause' })).buttons;
    main!.act(); expect(agir).toHaveBeenLastCalledWith('button', 'press', R.reprise);
  });

  it('no stop role, no stop button', () => {
    const buttons = frame(CARD, ...printer({ sans: ['arret'] })).buttons;
    expect(buttons[2]).toBeUndefined();
    expect(buttons[1]).toBeDefined();
  });

  it('a button the integration marks unavailable leaves its place empty', () => {
    const [cam, main, stop] = frame(CARD, ...printer({ buttons: 'unavailable' })).buttons;
    expect(cam).toBeDefined();
    expect(main).toBeUndefined();
    expect(stop).toBeUndefined();
  });

  it('finished: the primary is "later", the one thing left to do from here', () => {
    const [, main] = frame({ ...CARD, rank: 2 }, ...printer({ status: 'finish', buttons: 'unavailable' })).buttons;
    expect(main?.icon).toBe('snooze');
  });

  it('a CJK job title keeps dir=auto', () => {
    const hote = document.createElement('div');
    render(renderCardFrame(frame(CARD, ...printer({ task: '猫のフィギュア — 二色の試作品' }))), hote);
    const title = hote.querySelector('.titre')!;
    expect(title.textContent).toBe('猫のフィギュア — 二色の試作品');
    expect(title.getAttribute('dir')).toBe('auto');
  });

  it('the print error, when the printer reports one, is the subtitle', () => {
    const fr = frame({ ...CARD, rank: 2 }, ...printer({ status: 'pause', error: 'on' }));
    expect(fr.subtitle).toBe('AMS slot 1 has run out of filament.');
  });

  it('the cover image is the background; no cover, the neutral colour', () => {
    expect(frame(CARD, ...printer()).background)
      .toEqual({ kind: 'image', url: '/api/image_proxy/image.p_cover?token=a' });
    expect(frame(CARD, ...printer({ sans: ['couverture'] })).background).toEqual({ kind: 'solid', token: 'neutral' });
  });

  it('no camera role, no camera button', () => {
    expect(frame(CARD, ...printer({ sans: ['camera'] })).buttons[0]).toBeUndefined();
  });
});

describe('printer card — the camera, shown while its button is held', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const pe = (type: string, x: number, id = 1) =>
    new PointerEvent(type, { clientX: x, clientY: 100, pointerId: id, bubbles: true });

  /** The card painted in `hote`, repainted by `s.dessiner` as the tablet does. */
  function mount() {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const fs = printer();
    const paint = () => render(renderCardFrame(frame(CARD, ...fs)), hote);
    (fs[1] as { dessiner: () => void }).dessiner = vi.fn(paint);
    paint();
    const button = () => hote.querySelector<HTMLElement>('[aria-label="Caméra"]')!;
    const camera = () => hote.querySelector<HTMLElement>('.carte-camera');
    return { button, camera };
  }

  it('held past its delay: the camera fills the card, until the release', () => {
    const m = mount();
    m.button().dispatchEvent(pe('pointerdown', 100));
    expect(m.camera()).toBeNull();
    vi.advanceTimersByTime(CAMERA_HOLD.delayMs);
    expect(m.camera()?.getAttribute('style')).toContain('/api/camera_proxy/camera.p_chamber?token=b');
    vi.advanceTimersByTime(2000);
    expect(m.camera()).not.toBeNull();
    m.button().dispatchEvent(pe('pointerup', 100));
    expect(m.camera()).toBeNull();
  });

  it('a plain tap never shows it', () => {
    const m = mount();
    m.button().dispatchEvent(pe('pointerdown', 100));
    vi.advanceTimersByTime(CAMERA_HOLD.delayMs / 2);
    m.button().dispatchEvent(pe('pointerup', 100));
    vi.advanceTimersByTime(2000);
    expect(m.camera()).toBeNull();
  });

  it('a swipe that starts on the button never shows it, and hides it once past the threshold', () => {
    const m = mount();
    m.button().dispatchEvent(pe('pointerdown', 100));
    m.button().dispatchEvent(pe('pointermove', 100 + SEUIL_PX * 2));
    vi.advanceTimersByTime(2000);
    expect(m.camera()).toBeNull();
    m.button().dispatchEvent(pe('pointerup', 100 + SEUIL_PX * 2));

    m.button().dispatchEvent(pe('pointerdown', 100));
    vi.advanceTimersByTime(CAMERA_HOLD.delayMs);
    expect(m.camera()).not.toBeNull();
    m.button().dispatchEvent(pe('pointermove', 100 + SEUIL_PX * 2));
    expect(m.camera()).toBeNull();
    m.button().dispatchEvent(pe('pointerup', 100 + SEUIL_PX * 2));
  });
});

describe('cardPress — a hold that fires its own action', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('`fire` runs on the hold, never on the tap; `onEnd` runs once a travel disarms the press', () => {
    const act = vi.fn();
    const fire = vi.fn();
    const onEnd = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const p = cardPress(act, { delayMs: 100, everyMs: 100, fire, onEnd });
    const ev = (type: string, x: number) => {
      const e = new PointerEvent(type, { clientX: x, clientY: 0, pointerId: 1, bubbles: true });
      Object.defineProperty(e, 'currentTarget', { value: el });
      return e;
    };
    p.onpointerdown(ev('pointerdown', 0));
    vi.advanceTimersByTime(100);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(act).not.toHaveBeenCalled();
    p.onpointermove(ev('pointermove', SEUIL_PX * 2));
    expect(onEnd).toHaveBeenCalledTimes(1);
    p.onpointerup(ev('pointerup', SEUIL_PX * 2));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(act).not.toHaveBeenCalled();
  });
});
