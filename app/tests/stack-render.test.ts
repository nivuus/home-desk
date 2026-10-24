// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { html, render } from 'lit';
import type { CardFrame } from '../src/rendu/card-frame';
import { renderStack } from '../src/rendu/stack';

const frame = (key: string, title: string): CardFrame => ({
  key, label: 'TIMER', title, middle: html``, buttons: [undefined, undefined, undefined],
  background: { kind: 'solid', token: 'timer' },
});
const F1 = frame('minuteur:timer.a', 'Pasta');
const F2 = frame('media:media_player.b', 'Film');
const F3 = frame('voiture:sensor.c', 'Car');

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

describe('renderStack', () => {
  it('dots only with more than one card', () => {
    render(renderStack([F1], 0), hote); expect(hote.querySelector('.points')).toBeNull();
    render(renderStack([F1, F2], 1), hote); expect(hote.querySelectorAll('.points > *')[1].classList.contains('courant')).toBe(true);
  });

  it('only the displayed card is in the DOM', () => {
    render(renderStack([F1, F2, F3], 1), hote);
    const cards = hote.querySelectorAll('.carte');
    expect(cards).toHaveLength(1);
    expect((cards[0] as HTMLElement).dataset.card).toBe(F2.key);
  });

  it('one dot per card, only the displayed one is current', () => {
    render(renderStack([F1, F2, F3], 2), hote);
    const dots = Array.from(hote.querySelectorAll('.points > *'));
    expect(dots).toHaveLength(3);
    expect(dots.map((d) => d.classList.contains('courant'))).toEqual([false, false, true]);
  });

  it('an index outside the stack is a caller bug, not a blank card', () => {
    expect(() => renderStack([F1], 1)).toThrow(RangeError);
    expect(() => renderStack([], 0)).toThrow(RangeError);
  });
});
