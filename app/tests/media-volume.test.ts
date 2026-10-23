// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stepVolume, holdRepeat } from '../src/rendu/media-volume';

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
    const el = document.createElement('div');
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
      const el = document.createElement('div');
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
});
