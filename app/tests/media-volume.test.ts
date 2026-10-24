// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, html } from 'lit';
import { stepVolume, holdRepeat, volumeRow, PENDING_MS } from '../src/rendu/media-volume';

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

  it('fires once at once, then repeats after the delay', () => {
    const el = document.body.appendChild(document.createElement('div'));
    const fire = vi.fn();
    const stop = holdRepeat(el, fire, OPTS);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(399);
    expect(fire).toHaveBeenCalledTimes(1);
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

  it('a release before the delay means a single step', () => {
    const el = document.createElement('div');
    const fire = vi.fn();
    holdRepeat(el, fire, OPTS);
    el.dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(2000);
    expect(fire).toHaveBeenCalledTimes(1);
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
      expect(fire, `${target} ${type}`).toHaveBeenCalledTimes(1);
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

