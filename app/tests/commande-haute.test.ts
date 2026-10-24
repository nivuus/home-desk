// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from 'lit';
import { ordreCommandes, type ContexteModes } from '../src/modes';
import { bouton } from '../src/rendu/tile';
import { Etat } from '../src/etat';
import type { Bouton } from '../src/screen-types';
import { CALME } from './contextes';

/** `Bouton.haute`: a tile that spans the two rows of its column. It is a COST in the cut, never
 *  a row of its own — the height budget of every mode (`combien`) is unchanged. */

const noms = (b: Bouton[]) => b.map((x) => x.libelle);
const tuile = (libelle: string, p: Partial<Bouton> = {}): Bouton =>
  ({ libelle, icone: 'sofa', entite: `light.${libelle.toLowerCase()}`, ...p });

/** No ambiance row: four places with the stack empty, two under a card. */
const QUATRE_PLACES: ContexteModes = { ...CALME, rangeeAmbiance: false };

describe('ordreCommandes — tall tile', () => {
  it('a tall tile takes two of the four places', () => {
    const commandes = [tuile('A'), tuile('B', { haute: true }), tuile('C'), tuile('D')];
    const coupe = ordreCommandes(commandes, QUATRE_PLACES, null);
    expect(noms(coupe)).toEqual(['A', 'B', 'C']);
    expect(coupe.find((b) => b.libelle === 'B')?.haute).toBe(true);
  });

  it('a pinned tall tile keeps its place, and the last unpinned tiles give way', () => {
    const commandes = [tuile('A'), tuile('B'), tuile('C'),
      tuile('Porte', { haute: true, epingle: true }), tuile('Rideau', { epingle: true })];
    expect(noms(ordreCommandes(commandes, QUATRE_PLACES, null))).toEqual(['A', 'Porte', 'Rideau']);
  });

  it('two tall tiles fill the four places on their own', () => {
    const commandes = [tuile('A', { haute: true }), tuile('B', { haute: true }), tuile('C')];
    expect(noms(ordreCommandes(commandes, QUATRE_PLACES, null))).toEqual(['A', 'B']);
  });

  it('on a single row there is nothing to span: normal height, one place', () => {
    const commandes = [tuile('A', { haute: true }), tuile('B'), tuile('C')];
    const coupe = ordreCommandes(commandes, CALME, 'media');
    expect(noms(coupe)).toEqual(['A', 'B']);
    expect(coupe.some((b) => b.haute)).toBe(false);
  });

  it('a pinned tall tile under a card is a normal tile on its single row', () => {
    // A card (the timer) leaves one row of two places: nothing to span, the tile takes one.
    const commandes = [tuile('A', { haute: true, epingle: true }), tuile('B')];
    expect(noms(ordreCommandes(commandes, CALME, 'minuteur'))).toEqual(['A', 'B']);
  });
});

describe('bouton — tall tile', () => {
  const rendre = (b: Bouton): HTMLElement => {
    const el = document.createElement('div');
    render(bouton(new Etat(), b, false, 'commande'), el);
    return el.firstElementChild as HTMLElement;
  };

  it('carries the `haute` class only when the tile is tall', () => {
    expect(rendre(tuile('A', { haute: true })).classList.contains('haute')).toBe(true);
    expect(rendre(tuile('A')).classList.contains('haute')).toBe(false);
  });
});
