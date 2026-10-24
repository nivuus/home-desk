// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, html } from 'lit';
import { stepVolume, volumeRow, PENDING_MS } from '../src/rendu/media-volume';
import { holdRepeat } from '../src/hold-repeat';
import { SEUIL_PX } from '../src/geste';

describe('stepVolume', () => {
  it('stepVolume clamps at both ends and snaps to 5 %', () => {
    expect(stepVolume(0.98, 1)).toBe(1);
    expect(stepVolume(0.03, -1)).toBe(0);
    expect(stepVolume(0.42, 1)).toBe(0.45);
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
    expect(stepVolume(0.4, -1)).toBe(0.35);
  });

  it('never returns a float artefact', () => {
    // 0.1 + 0.05 is 0.15000000000000002 in binary floating point.
    expect(stepVolume(0.1, 1)).toBe(0.15);
    expect(stepVolume(0.7, 1)).toBe(0.75);
  });
});

describe('holdRepeat', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const OPTS = { delayMs: 400, everyMs: 200 };

  it('fires nothing before the delay, then once at the delay and every step after', () => {
    const el = document.body.appendChild(document.createElement('div'));
    const fire = vi.fn();
    const stop = holdRepeat(el, fire, OPTS);
    vi.advanceTimersByTime(399);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 + 200 * 3);
    expect(fire).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(2000);
    expect(fire).toHaveBeenCalledTimes(4);
  });

  it('hold repeat stops on pointerup, pointercancel and pointerleave', () => {
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      const el = document.body.appendChild(document.createElement('div'));
      const fire = vi.fn();
      holdRepeat(el, fire, OPTS);
      vi.advanceTimersByTime(600);
      const before = fire.mock.calls.length;
      expect(before, type).toBeGreaterThan(1);
      el.dispatchEvent(new Event(type));
      vi.advanceTimersByTime(2000);
      expect(fire.mock.calls.length, type).toBe(before);
    }
  });

  it('a release before the delay repeats nothing (the single step is the tap\'s, `cardPress`)', () => {
    const el = document.createElement('div');
    const fire = vi.fn();
    holdRepeat(el, fire, OPTS);
    el.dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(2000);
    expect(fire).not.toHaveBeenCalled();
  });

  it('a hold whose button leaves the DOM stops, and ends', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const fire = vi.fn();
    const end = vi.fn();
    holdRepeat(el, fire, OPTS, end);
    vi.advanceTimersByTime(600);
    const before = fire.mock.calls.length;
    el.remove();                       // re-rendered away: it will never see its pointerup
    vi.advanceTimersByTime(2000);
    expect(fire.mock.calls.length).toBe(before);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('a release anywhere in the document, or a lost capture, ends the hold', () => {
    for (const [target, type] of [['document', 'pointerup'], ['document', 'pointercancel'],
                                  ['el', 'lostpointercapture']] as const) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const fire = vi.fn();
      const end = vi.fn();
      holdRepeat(el, fire, OPTS, end);
      (target === 'document' ? document : el).dispatchEvent(new Event(type));
      vi.advanceTimersByTime(2000);
      expect(fire, `${target} ${type}`).not.toHaveBeenCalled();
      expect(end, `${target} ${type}`).toHaveBeenCalledTimes(1);
      el.remove();
    }
  });
});

describe('volumeRow: the optimistic level belongs to the render', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  /** A tiny screen: `published` is what Home Assistant says, `repaint` re-renders like `dessiner`. */
  function mount(entity: string, published: number) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const state = { published };
    const act = vi.fn();
    const repaint = () => render(html`${volumeRow(
      { entite: entity, niveau: state.published, parPas: false }, act, repaint)}`, host);
    repaint();
    const shown = () => host.querySelector('.media-niveau-texte')!.textContent;
    const plus = () => host.querySelector<HTMLElement>('[data-mvt="detail:volume-plus"]')!;
    return { host, state, act, repaint, shown, plus };
  }

  it('an echo of an intermediate value during a hold does not move the shown level back', () => {
    const m = mount('media_player.echo', 0.4);
    m.plus().dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(400 + 200);           // 0.45, then 0.5 (hold), 0.55
    const lastSent = m.act.mock.lastCall![3].volume_level;
    expect(lastSent).toBe(0.5);
    m.state.published = 0.45;                    // HA echoes the first step, late
    m.repaint();
    expect(m.shown()).toBe('50\u00a0%');
    vi.advanceTimersByTime(200);                 // the next step starts from 0.5, not 0.45
    expect(m.act.mock.lastCall![3].volume_level).toBe(0.55);
    m.plus().dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(PENDING_MS);
  });

  it('a rejected change falls back to the published level after the timeout', () => {
    const m = mount('media_player.rejects', 0.4);
    m.plus().dispatchEvent(new Event('pointerdown'));
    m.plus().dispatchEvent(new Event('pointerup'));
    expect(m.shown()).toBe('45\u00a0%');
    m.repaint();                                 // HA republishes 0.4: the change was refused
    expect(m.shown()).toBe('45\u00a0%');
    vi.advanceTimersByTime(PENDING_MS);
    expect(m.shown()).toBe('40\u00a0%');
    expect(m.host.querySelector<HTMLElement>('.media-volume')!.style.getPropertyValue('--niveau'))
      .toBe('0.4');
  });

  const pe = (type: string, x: number, id = 1) =>
    new PointerEvent(type, { clientX: x, clientY: 100, pointerId: id, bubbles: true });

  it('a tap steps once, on release', () => {
    const m = mount('media_player.tap', 0.4);
    m.plus().dispatchEvent(pe('pointerdown', 100));
    expect(m.act).not.toHaveBeenCalled();
    m.plus().dispatchEvent(pe('pointerup', 101));
    expect(m.act).toHaveBeenCalledTimes(1);
    expect(m.act.mock.lastCall![3].volume_level).toBe(0.45);
    vi.advanceTimersByTime(PENDING_MS);
  });

  it('a swipe that starts on a stepper leaves the volume unchanged', () => {
    const m = mount('media_player.swipe', 0.4);
    m.plus().dispatchEvent(pe('pointerdown', 100));
    m.plus().dispatchEvent(pe('pointermove', 100 - SEUIL_PX * 4));
    vi.advanceTimersByTime(2000);                // long past the hold delay
    m.plus().dispatchEvent(pe('pointerup', 100 - SEUIL_PX * 4));
    expect(m.act).not.toHaveBeenCalled();
    expect(m.shown()).toBe('40\u00a0%');
  });

  it('a hold that turns into a swipe stops repeating at the threshold', () => {
    const m = mount('media_player.hold-swipe', 0.4);
    m.plus().dispatchEvent(pe('pointerdown', 100));
    vi.advanceTimersByTime(400 + 200);           // 0.45 at the delay, then 0.5
    expect(m.act).toHaveBeenCalledTimes(2);
    m.plus().dispatchEvent(pe('pointermove', 100 + SEUIL_PX * 2));
    vi.advanceTimersByTime(2000);
    m.plus().dispatchEvent(pe('pointerup', 100 + SEUIL_PX * 2));
    expect(m.act).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(PENDING_MS);
  });

  it('a hold released after repeating adds no extra step', () => {
    const m = mount('media_player.hold', 0.4);
    m.plus().dispatchEvent(pe('pointerdown', 100));
    vi.advanceTimersByTime(400);
    m.plus().dispatchEvent(pe('pointerup', 100));
    expect(m.act).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PENDING_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('once HA reaches the target, its later values show at once', () => {
    const m = mount('media_player.reaches', 0.4);
    m.plus().dispatchEvent(new Event('pointerdown'));
    m.plus().dispatchEvent(new Event('pointerup'));
    m.state.published = 0.45;
    m.repaint();
    m.state.published = 0.2;                     // someone else turns it down
    m.repaint();
    expect(m.shown()).toBe('20\u00a0%');
  });
});

