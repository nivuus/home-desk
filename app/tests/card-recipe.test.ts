// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/recipe';
import { formaterRestant } from '../src/minuteur';
import { frameWith, screenWith, running } from './card-aides';

const recipeCtx = { recetteEnCours: true } as never;
const s = screenWith({ recetteUid: '42', platRecette: 'Gratin', pageSourceIndex: [0, 0, 1], pageRecette: 2 });
const card = { key: 'recette:42', type: 'recette', rank: 0 } as const;

describe('recipe card', () => {
  it('rank 0 while a recipe is in progress, keyed by its uid', () => {
    expect(detect(frameWith({ ctx: recipeCtx }), s)).toEqual([card]);
  });
  it('no recipe in progress, no card', () => {
    expect(detect(frameWith(), screenWith())).toEqual([]);
  });
  it('title is the dish, the middle is the current step and the running timer countdown', () => {
    const fr = frame(card, frameWith({ ctx: recipeCtx, timers: [running('timer.k', 125)] }), s);
    expect(fr.title).toBe('Gratin');
    const host = document.createElement('div');
    render(fr.middle, host);
    expect(host.textContent).toContain('2/2');
    expect(host.textContent).toContain(formaterRestant(125));
  });
  it('without a running timer the middle carries the step alone', () => {
    const host = document.createElement('div');
    render(frame(card, frameWith({ ctx: recipeCtx }), s).middle, host);
    expect(host.textContent).not.toContain(':');
  });
  it('the central button reopens the recipe view, the sides stay empty, neutral background', () => {
    const fr = frame(card, frameWith({ ctx: recipeCtx }), s);
    expect(fr.buttons[0]).toBeUndefined();
    expect(fr.buttons[2]).toBeUndefined();
    expect(fr.buttons[1]!.primary).toBe(true);
    fr.buttons[1]!.act();
    expect(location.hash).toBe('#recette');
    expect(fr.background).toEqual({ kind: 'solid', token: 'neutral' });
  });
});
