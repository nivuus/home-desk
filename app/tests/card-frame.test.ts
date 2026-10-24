// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { html, render } from 'lit';
import { renderCardFrame, type CardButton, type CardFrame } from '../src/rendu/card-frame';
import type { ToneState } from '../src/rendu/poster-sampler';

const PLAY: CardButton = { icon: 'lecture', label: 'Play', primary: true, act: () => {} };
const STOP: CardButton = { icon: 'stop', label: 'Stop', act: () => {} };
const BASE: CardFrame = {
  key: 'minuteur:timer.fixture', label: 'MINUTEUR · Cuisine', title: 'Pâtes', subtitle: 'sonne à 12:41',
  middle: html`<div class="milieu-essai">2:48</div>`,
  buttons: [undefined, PLAY, STOP],
  background: { kind: 'solid', token: 'timer' },
};
const READY: ToneState = { status: 'ready', tones: {
  text: '#101010', primary: '#303030', onPrimary: '#fafafa', secondary: '#e0e0e0',
  onSecondary: '#101010', worstContrast: 7 } };

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

const carte = () => hote.querySelector<HTMLElement>('.carte')!;

describe('card frame — anatomy', () => {
  it('renders three fixed slots, empty ones stay empty', () => {
    render(renderCardFrame({ ...BASE, buttons: [undefined, PLAY, undefined] }), hote);
    const slots = hote.querySelectorAll('.carte .actions > *');
    expect(slots).toHaveLength(3);
    expect(slots[0].classList.contains('vide')).toBe(true);
    expect(slots[1].getAttribute('aria-label')).toBe(PLAY.label);
    expect(slots[1].textContent!.trim()).toBe('');            // icon only, never text
    expect(slots[1].classList.contains('primaire')).toBe(true);
    expect(slots[2].classList.contains('vide')).toBe(true);
  });

  it('every text from HA carries dir=auto and the two-line clamp', () => {
    render(renderCardFrame(BASE), hote);
    for (const sel of ['.etiquette', '.titre', '.sous-titre']) expect(hote.querySelector(sel)!.getAttribute('dir')).toBe('auto');
    expect(hote.querySelector('.titre')!.classList.contains('deux-lignes')).toBe(true);
  });

  it('the root is the central block, named by the card key', () => {
    render(renderCardFrame(BASE), hote);
    expect(carte().tagName).toBe('SECTION');
    expect(carte().dataset.zone).toBe('blocCentral');
    expect(carte().dataset.card).toBe(BASE.key);
  });

  it('the middle zone holds what the card gives, between header and buttons', () => {
    render(renderCardFrame(BASE), hote);
    expect(Array.from(carte().children).map((c) => c.className.split(' ')[0]))
      .toEqual(['entete', 'milieu', 'actions']);
    expect(carte().querySelector('.milieu .milieu-essai')!.textContent).toBe('2:48');
  });

  it('no subtitle element without a subtitle', () => {
    render(renderCardFrame({ ...BASE, subtitle: undefined }), hote);
    expect(hote.querySelector('.sous-titre')).toBeNull();
  });

  it('every header text is a tone box with its plate', () => {
    render(renderCardFrame(BASE), hote);
    for (const sel of ['.etiquette', '.titre', '.sous-titre']) {
      const el = hote.querySelector(sel)!;
      expect(el.hasAttribute('data-tone-box'), sel).toBe(true);
      expect(el.classList.contains('plaque'), sel).toBe(true);
    }
  });

  it('motion keys are carried when given, absent otherwise', () => {
    render(renderCardFrame({ ...BASE, motion: { block: 'bloc:essai', state: 'Pâtes', subtitle: 'detail:essai-sous' },
      buttons: [undefined, { ...PLAY, mvt: 'detail:essai-lecture' }, undefined] }), hote);
    expect(carte().dataset.mvt).toBe('bloc:essai');
    expect(carte().dataset.mvtEtat).toBe('Pâtes');
    expect(hote.querySelector('.sous-titre')!.getAttribute('data-mvt')).toBe('detail:essai-sous');
    expect(hote.querySelector('.primaire')!.getAttribute('data-mvt')).toBe('detail:essai-lecture');
    render(renderCardFrame(BASE), hote);
    expect(carte().hasAttribute('data-mvt')).toBe(false);
  });
});

describe('card frame — buttons', () => {
  it('a press fires the action on release (a swipe may start on a button)', () => {
    const act = vi.fn();
    render(renderCardFrame({ ...BASE, buttons: [undefined, { ...PLAY, act }, undefined] }), hote);
    const b = hote.querySelector('.primaire')!;
    b.dispatchEvent(new Event('pointerdown'));
    expect(act).not.toHaveBeenCalled();
    b.dispatchEvent(new Event('pointerup'));
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('an inert button renders, does nothing and gives no press feedback', () => {
    const act = vi.fn();
    render(renderCardFrame({ ...BASE, buttons: [{ ...STOP, act, inert: true }, undefined, undefined] }), hote);
    const b = hote.querySelector<HTMLElement>('.actions > .bouton')!;
    expect(b.classList.contains('inerte')).toBe(true);
    expect(b.hasAttribute('inert')).toBe(true);
    b.dispatchEvent(new Event('pointerdown'));
    b.dispatchEvent(new Event('pointerup'));
    expect(act).not.toHaveBeenCalled();
    expect(b.classList.contains('appuye')).toBe(false);
  });
});

describe('card frame — backgrounds', () => {
  it('a solid background maps the token colours, never an image layer', () => {
    render(renderCardFrame(BASE), hote);
    expect(carte().style.getPropertyValue('--c-fond')).toBe('var(--carte-timer-fond)');
    expect(carte().style.getPropertyValue('--c-texte')).toBe('var(--carte-timer-texte)');
    expect(carte().querySelector('.carte-image')).toBeNull();
  });

  it('an image is a cover layer with ready tones only, the tones colour the card', () => {
    const img: CardFrame = { ...BASE, background: { kind: 'image', url: '/api/vignette?url=x' }, tones: READY };
    render(renderCardFrame(img), hote);
    expect(carte().classList.contains('avec-image')).toBe(true);
    expect(carte().querySelector<HTMLElement>('.carte-image')!.style.backgroundImage).toContain('/api/vignette?url=x');
    expect(carte().querySelector('img')).toBeNull();
    expect(carte().style.getPropertyValue('--mc-text')).toBe('#101010');
    for (const tones of [{ status: 'pending' }, { status: 'unreadable' }, { status: 'failed' }] as ToneState[]) {
      render(renderCardFrame({ ...img, tones }), hote);
      expect(carte().querySelector('.carte-image')).toBeNull();
      expect(carte().style.getPropertyValue('--mc-text')).toBe('');
    }
  });
});
