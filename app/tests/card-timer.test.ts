// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/timer';
import { brancherMinuteur, type ActionsMinuteur } from '../src/rendu/minuteur';
import { formaterRestant } from '../src/minuteur';
import { frameWith, screenWith, running, paused, T0 } from './card-aides';

const s = screenWith();
const card = { key: 'minuteur:timer.cuisine', type: 'minuteur', rank: 1 } as const;

const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  const rec = (n: string) => (...a: unknown[]) => { calls.push(`${n}:${a.join(',')}`); };
  brancherMinuteur({
    pause: rec('pause'), reprendre: rec('reprendre'), annuler: rec('annuler'), ajuster: rec('ajuster'),
  } as unknown as ActionsMinuteur);
});

describe('timer card — detect', () => {
  it('a paused timer is still a rank-1 card', () => {
    expect(detect(frameWith({ timers: [paused('timer.cuisine', 120)] }), s))
      .toEqual([{ key: 'minuteur:timer.cuisine', type: 'minuteur', rank: 1 }]);
  });
  it('no timer, no card', () => { expect(detect(frameWith({ timers: [] }), s)).toEqual([]); });
  it('one card, for the most urgent timer (the first of the sorted views)', () => {
    const f = frameWith({ timers: [running('timer.a', 30, 1), running('timer.b', 90, 0)] });
    expect(detect(f, s)).toEqual([{ key: 'minuteur:timer.a', type: 'minuteur', rank: 1 }]);
  });
});

describe('timer card — head choice', () => {
  it('pausing the head while a longer timer runs keeps the paused card, with resume', () => {
    const f = frameWith({ timers: [running('timer.long', 600, 1), paused('timer.short', 120, 0)] });
    expect(detect(f, s)).toEqual([{ key: 'minuteur:timer.short', type: 'minuteur', rank: 1 }]);
    const fr = frame({ key: 'minuteur:timer.short', type: 'minuteur', rank: 1 }, f, s);
    expect(fr.buttons[1]!.icon).toBe('lecture');
  });
  it('swaps only when another running timer gets below the head', () => {
    const f = frameWith({ timers: [running('timer.a', 30, 1), paused('timer.b', 120, 0)] });
    expect(detect(f, s)[0].key).toBe('minuteur:timer.a');
  });
});

describe('timer card — frame', () => {
  it('a paused timer never turns late, whatever its remaining time', () => {
    const fr = frame(card, frameWith({ timers: [paused('timer.cuisine', 20)] }), s);
    expect(fr.background).toEqual({ kind: 'solid', token: 'timer' });
  });
  it('three icon buttons, primary in the middle, late colour under a minute', () => {
    const fr = frame(card, frameWith({ timers: [running('timer.cuisine', 45)] }), s);
    expect(fr.buttons.map((b) => b?.icon)).toEqual(['plus', 'pause', 'stop']);
    expect(fr.buttons[1]!.primary).toBe(true);
    expect(fr.background).toEqual({ kind: 'solid', token: 'timer-late' });
  });
  it('plain timer colour from one minute up', () => {
    const fr = frame(card, frameWith({ timers: [running('timer.cuisine', 60)] }), s);
    expect(fr.background).toEqual({ kind: 'solid', token: 'timer' });
  });
  it('a paused timer offers resume in the middle and no +1 min (it would restart it)', () => {
    const fr = frame(card, frameWith({ timers: [paused('timer.cuisine', 120)] }), s);
    expect(fr.buttons.map((b) => b?.icon)).toEqual([undefined, 'lecture', 'stop']);
    expect(fr.buttons[1]!.primary).toBe(true);
  });
  it('buttons call the existing timer actions by slot', () => {
    const f = frameWith({ timers: [running('timer.cuisine', 300, 2)] });
    const [plus, pause, stop] = frame(card, f, s).buttons;
    plus!.act(); pause!.act(); stop!.act();
    expect(calls).toEqual(['ajuster:2,60', 'pause:2', 'annuler:2']);
    calls.length = 0;
    frame(card, frameWith({ timers: [paused('timer.cuisine', 5, 1)] }), s).buttons[1]!.act();
    expect(calls).toEqual(['reprendre:1']);
  });
  it('the title is the timer name, its rank when it has none; the subtitle is the ring time', () => {
    const named = frame(card, frameWith({ timers: [running('timer.cuisine', 300, 0, 'Pâtes')] }), s);
    expect(named.title).toBe('Pâtes');
    expect(frame(card, frameWith({ timers: [running('timer.cuisine', 300, 1)] }), s).title).toBe('N° 2');
    const ring = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
      .format(new Date(T0 + 300_000));
    expect(named.subtitle).toContain(ring);
  });
  it('a paused timer rings at no time: no subtitle', () => {
    expect(frame(card, frameWith({ timers: [paused('timer.cuisine', 300)] }), s).subtitle).toBeUndefined();
  });
  it('the middle is the countdown node the one-second tick writes, and the other timers as +N', () => {
    const f = frameWith({ timers: [running('timer.cuisine', 125, 1), running('timer.b', 400, 0),
                                   paused('timer.c', 10, 2)] });
    const host = document.createElement('div');
    render(frame(card, f, s).middle, host);
    const t = host.querySelector<HTMLElement>('.mn-temps')!;
    expect(t.dataset.minuteur).toBe('1');
    expect(t.textContent).toBe(formaterRestant(125));
    expect(host.textContent).toContain(new Intl.NumberFormat(undefined, { signDisplay: 'always' }).format(2));
  });
  it('alone, the card shows no +N', () => {
    const host = document.createElement('div');
    render(frame(card, frameWith({ timers: [running('timer.cuisine', 125)] }), s).middle, host);
    expect(host.querySelector('.timer-autres')).toBeNull();
  });
  it('refuses a card whose timer is gone rather than showing another one', () => {
    expect(() => frame(card, frameWith({ timers: [] }), s)).toThrow(/timer\.cuisine/);
  });
});
