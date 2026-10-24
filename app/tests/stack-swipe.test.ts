// @vitest-environment jsdom
//
// Swiping between stack cards (`attachSwipe`) and tap-safe card buttons (`cardPress`), on a real
// card frame: the buttons are bound by `renderCardFrame`, the swipe sits on the `.carte` element,
// and synthetic pointer events bubble from the button to the card as they do on the tablets
// (touch pointers are implicitly captured by their `pointerdown` target).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { html, render } from 'lit';
import { renderCardFrame, type CardFrame } from '../src/rendu/card-frame';
import { attachSwipe, SLIDE_MS } from '../src/stack/swipe';
import { SEUIL_PX, DELAI_SECOURS_MS } from '../src/geste';

type Opts = { dx?: number; dy?: number; id?: number; up?: 'pointerup' | 'pointercancel' };
const pe = (type: string, x: number, y: number, id = 1) =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true });

/** Down at (100, 100), a few moves to (100 + dx, 100 + dy), then up (or cancel). */
function dragFrom(target: Element, { dx = 0, dy = 0, id = 1, up = 'pointerup' }: Opts = {}) {
  target.dispatchEvent(pe('pointerdown', 100, 100, id));
  for (let i = 1; i <= 4; i++) target.dispatchEvent(pe('pointermove', 100 + (dx * i) / 4, 100 + (dy * i) / 4, id));
  target.dispatchEvent(pe(up, 100 + dx, 100 + dy, id));
}
const tap = (target: Element) => dragFrom(target);

let hote: HTMLElement;
let act: ReturnType<typeof vi.fn>;
let onChange: ReturnType<typeof vi.fn>;
let onTouch: ReturnType<typeof vi.fn>;
let detach: () => void = () => {};

function card(): { el: HTMLElement; button: HTMLElement } {
  const f: CardFrame = {
    key: 'minuteur:timer.fixture', label: 'TIMER', title: 'Pasta', middle: html``,
    buttons: [undefined, { icon: 'lecture', label: 'Play', primary: true, act }, undefined],
    background: { kind: 'solid', token: 'timer' },
  };
  render(renderCardFrame(f), hote);
  return { el: hote.querySelector<HTMLElement>('.carte')!, button: hote.querySelector<HTMLElement>('.primaire')! };
}

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  act = vi.fn(); onChange = vi.fn(); onTouch = vi.fn();
});
afterEach(() => { detach(); detach = () => {}; hote.remove(); });

describe('attachSwipe — moving between cards', () => {
  it('a horizontal drag past SEUIL_PX moves to the next card', () => {
    const { el } = card();
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    dragFrom(el, { dx: -(SEUIL_PX * 4) });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('a drag to the right moves to the previous card', () => {
    const { el } = card();
    detach = attachSwipe(el, { count: 3, index: 2, onChange, onTouch });
    dragFrom(el, { dx: SEUIL_PX * 4 });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('no move past the ends', () => {
    const { el } = card();
    detach = attachSwipe(el, { count: 2, index: 1, onChange, onTouch });
    dragFrom(el, { dx: -(SEUIL_PX * 4) });
    detach();
    detach = attachSwipe(el, { count: 2, index: 0, onChange, onTouch });
    dragFrom(el, { dx: SEUIL_PX * 4 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a vertical drag, a short wobble or a cancelled drag changes nothing', () => {
    const { el } = card();
    detach = attachSwipe(el, { count: 3, index: 1, onChange, onTouch });
    dragFrom(el, { dx: SEUIL_PX, dy: SEUIL_PX * 4 });
    dragFrom(el, { dx: -(SEUIL_PX - 2) });
    dragFrom(el, { dx: -(SEUIL_PX * 4), up: 'pointercancel' });
    el.dispatchEvent(pe('pointerdown', 100, 100));          // out past the threshold and back
    el.dispatchEvent(pe('pointermove', 100 - SEUIL_PX * 3, 100));
    el.dispatchEvent(pe('pointermove', 99, 100));
    el.dispatchEvent(pe('pointerup', 99, 100));
    expect(onChange).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
  });

  it('every touch counts as a touch, a swipe once', () => {
    const { el } = card();
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    tap(el);
    dragFrom(el, { dx: -(SEUIL_PX * 4) });
    expect(onTouch).toHaveBeenCalledTimes(2);
  });

  it('a phantom pointerdown during a swipe neither restarts nor doubles it', () => {
    const { el } = card();
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    el.dispatchEvent(pe('pointerdown', 100, 100, 1));
    el.dispatchEvent(pe('pointermove', 70, 100, 1));
    el.dispatchEvent(pe('pointerdown', 72, 101, 9));     // the WebView's phantom contact
    el.dispatchEvent(pe('pointermove', 40, 100, 1));
    el.dispatchEvent(pe('pointerup', 40, 100, 1));
    el.dispatchEvent(pe('pointerup', 42, 101, 9));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledTimes(1);
  });

  it('the card follows the finger and lets go of its offset on release', () => {
    const { el } = card();
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    el.dispatchEvent(pe('pointerdown', 100, 100));
    el.dispatchEvent(pe('pointermove', 40, 100));
    expect(el.style.transform).toBe('translateX(-60px)');
    el.dispatchEvent(pe('pointerup', 40, 100));
    expect(el.style.transform).toBe('');
  });

  it('leaves no timer and no listener behind', () => {
    vi.useFakeTimers();
    try {
      const avant = vi.getTimerCount();
      const { el } = card();
      detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
      dragFrom(el, { dx: -(SEUIL_PX * 4) });
      expect(vi.getTimerCount()).toBe(avant);
      el.dispatchEvent(pe('pointerdown', 100, 100));      // a gesture still open when detached
      detach();
      expect(vi.getTimerCount()).toBe(avant);
      dragFrom(el, { dx: -(SEUIL_PX * 4) });
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('a gesture whose release never comes frees the card after DELAI_SECOURS_MS', () => {
    vi.useFakeTimers();
    try {
      const { el } = card();
      detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
      el.dispatchEvent(pe('pointerdown', 100, 100));
      el.dispatchEvent(pe('pointermove', 40, 100));       // release lost by the WebView
      vi.advanceTimersByTime(DELAI_SECOURS_MS);
      expect(el.style.transform).toBe('');
      dragFrom(el, { dx: -(SEUIL_PX * 4) });
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('attachSwipe — one contact per card', () => {
  it('a phantom on a button during a swipe from the card body fires nothing', () => {
    const { el, button } = card();
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    el.dispatchEvent(pe('pointerdown', 100, 100, 1));
    el.dispatchEvent(pe('pointermove', 60, 100, 1));
    button.dispatchEvent(pe('pointerdown', 62, 101, 9));   // the phantom, over a button
    button.dispatchEvent(pe('pointerup', 63, 101, 9));     // and released within SEUIL_PX
    el.dispatchEvent(pe('pointermove', 40, 100, 1));
    el.dispatchEvent(pe('pointerup', 40, 100, 1));
    expect(act).not.toHaveBeenCalled();
    expect(button.classList.contains('appuye')).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a phantom on another button during a press fires neither', () => {
    const other = vi.fn();
    const f: CardFrame = {
      key: 'minuteur:timer.fixture', label: 'TIMER', title: 'Pasta', middle: html``,
      buttons: [{ icon: 'croix', label: 'Stop', act: other },
        { icon: 'lecture', label: 'Play', primary: true, act }, undefined],
      background: { kind: 'solid', token: 'timer' },
    };
    render(renderCardFrame(f), hote);
    const el = hote.querySelector<HTMLElement>('.carte')!;
    const [stop, play] = Array.from(hote.querySelectorAll<HTMLElement>('.actions > .bouton'));
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    play.dispatchEvent(pe('pointerdown', 100, 100, 1));
    play.dispatchEvent(pe('pointermove', 100 - SEUIL_PX * 3, 100, 1));   // a swipe from Play
    stop.dispatchEvent(pe('pointerdown', 60, 100, 9));
    stop.dispatchEvent(pe('pointerup', 61, 100, 9));
    play.dispatchEvent(pe('pointerup', 100 - SEUIL_PX * 4, 100, 1));
    expect(other).not.toHaveBeenCalled();
    expect(act).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('the new card slides in from the side opposite the push, within SLIDE_MS', () => {
    const { el } = card();
    el.getBoundingClientRect = () => ({ width: 311 } as DOMRect);
    const animate = vi.spyOn(el, 'animate');
    detach = attachSwipe(el, { count: 3, index: 1, onChange, onTouch });
    dragFrom(el, { dx: -(SEUIL_PX * 4) });
    expect(animate.mock.calls[0][0]).toEqual([{ transform: 'translateX(311px)' }, { transform: 'none' }]);
    dragFrom(el, { dx: SEUIL_PX * 4 });
    expect(animate.mock.calls[1][0]).toEqual([{ transform: 'translateX(-311px)' }, { transform: 'none' }]);
    expect((animate.mock.calls[1][1] as KeyframeAnimationOptions).duration).toBe(SLIDE_MS);
    expect(SLIDE_MS).toBeLessThanOrEqual(200);
  });
});

describe('cardPress — card buttons inside a swipeable card', () => {
  it('a drag that starts on a button does not fire the button', () => {
    const { el, button } = card();
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    dragFrom(button, { dx: -(SEUIL_PX * 4) });
    expect(act).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('a clean tap fires once', () => {
    const { el, button } = card();
    detach = attachSwipe(el, { count: 3, index: 0, onChange, onTouch });
    tap(button);
    expect(act).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires on release, not on contact; shows .appuye from contact to release', () => {
    const { button } = card();
    button.dispatchEvent(pe('pointerdown', 100, 100));
    expect(act).not.toHaveBeenCalled();
    expect(button.classList.contains('appuye')).toBe(true);
    button.dispatchEvent(pe('pointerup', 101, 100));
    expect(act).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('appuye')).toBe(false);
  });

  it('a wobble under the threshold is still a tap; past it, the feedback goes', () => {
    const { button } = card();
    dragFrom(button, { dx: SEUIL_PX - 2 });
    expect(act).toHaveBeenCalledTimes(1);
    button.dispatchEvent(pe('pointerdown', 100, 100));
    button.dispatchEvent(pe('pointermove', 100, 100 + SEUIL_PX));
    expect(button.classList.contains('appuye')).toBe(false);
    button.dispatchEvent(pe('pointerup', 100, 100));       // back near the start: still not a tap
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('a cancelled press fires nothing', () => {
    const { button } = card();
    dragFrom(button, { up: 'pointercancel' });
    expect(act).not.toHaveBeenCalled();
    expect(button.classList.contains('appuye')).toBe(false);
  });

  it('a phantom pointerdown during a press neither re-arms nor doubles it', () => {
    const { button } = card();
    button.dispatchEvent(pe('pointerdown', 100, 100, 1));
    button.dispatchEvent(pe('pointermove', 100 + SEUIL_PX * 2, 100, 1));   // a swipe, dropped
    button.dispatchEvent(pe('pointerdown', 100 + SEUIL_PX * 2, 101, 9));   // phantom
    button.dispatchEvent(pe('pointerup', 100 + SEUIL_PX * 2, 101, 9));
    button.dispatchEvent(pe('pointerup', 100 + SEUIL_PX * 2, 100, 1));
    expect(act).not.toHaveBeenCalled();
  });

  it('a press survives a re-render between contact and release', () => {
    const { button } = card();
    button.dispatchEvent(pe('pointerdown', 100, 100));
    card();                                                  // lit re-renders, new handlers
    button.dispatchEvent(pe('pointerup', 100, 100));
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('a press whose release was lost does not block the next one', () => {
    const { button } = card();
    const down = pe('pointerdown', 100, 100);
    button.dispatchEvent(down);
    button.dispatchEvent(pe('pointermove', 100, 100 + SEUIL_PX * 2));      // dropped, release lost
    const later = pe('pointerdown', 100, 100);
    Object.defineProperty(later, 'timeStamp', { value: down.timeStamp + DELAI_SECOURS_MS });
    button.dispatchEvent(later);
    button.dispatchEvent(pe('pointerup', 100, 100));
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('a press creates no timer', () => {
    vi.useFakeTimers();
    try {
      const avant = vi.getTimerCount();
      const { button } = card();
      button.dispatchEvent(pe('pointerdown', 100, 100));
      expect(vi.getTimerCount()).toBe(avant);
      button.dispatchEvent(pe('pointerup', 100, 100));
    } finally { vi.useRealTimers(); }
  });
});
