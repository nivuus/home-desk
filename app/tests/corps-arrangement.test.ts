// @vitest-environment jsdom
//
// The body follows the budget's arrangement (2026-10-24, spec 2026-10-23 "Place à l'écran"):
// while the media card is shown, the synthèse is reduced first, and the Ambiance row goes only if
// that is not enough. Kept apart from `corps.test.ts`, which is already far past 500 lines.
import { describe, it, expect } from 'vitest';
import { render, html } from 'lit';
import { Etat } from '../src/etat';
import { ECRANS } from '../src/ecran';
import { rendreCorps } from '../src/rendu/corps';
import type { ContexteModes } from '../src/modes';
import { CALME } from './contextes';

/** A central block marked like every real mode block, so the zone exists in the column. */
const BLOC = html`<div class="media" data-zone="blocCentral"></div>`;

const avecRangee: ContexteModes = { ...CALME, rangeeAmbiance: true };
const sansRangee: ContexteModes = { ...CALME, rangeeAmbiance: false };

function rendre(ecran: keyof typeof ECRANS, ctx: ContexteModes): HTMLElement {
  const etat = new Etat();
  for (const b of [...ECRANS[ecran].commandes, ...ECRANS[ecran].ambiances]) {
    etat.appliquer({ entity_id: b.entite, state: 'off', attributes: {} });
  }
  const hote = document.createElement('div');
  render(rendreCorps(etat, ECRANS[ecran], BLOC, ctx), hote);
  return hote;
}

describe('rendreCorps suit l arrangement du budget', () => {
  it('ambiance zone not rendered when the arrangement drops it', () => {
    // Office shape: Ambiance row declared, media card shown -> the ladder drops the row.
    const media = rendre('bureau', { ...avecRangee, sourceJoue: true });
    expect(media.querySelector('[data-zone="rangeeAmbiance"]')).toBeNull();
    expect(media.querySelector('[data-zone="etiquetteAmbiance"]')).toBeNull();
    // The controls stay (spec: "Les commandes restent").
    expect(media.querySelectorAll('.commande').length).toBe(2);
    // Same screen, default mode: the row is there.
    const defaut = rendre('bureau', avecRangee);
    expect(defaut.querySelector('[data-zone="rangeeAmbiance"]')).not.toBeNull();
    expect(defaut.querySelector('[data-zone="etiquetteAmbiance"]')).not.toBeNull();
  });

  it('synthèse carries reduite when the arrangement reduces it', () => {
    // Living-room shape: no Ambiance row, the reduced synthèse alone is enough.
    const media = rendre('salon', { ...sansRangee, sourceJoue: true });
    expect(media.querySelector('.synthese')!.classList.contains('reduite')).toBe(true);
    const cinema = rendre('bureau', { ...avecRangee, ecranAllume: true });
    expect(cinema.querySelector('.synthese')!.classList.contains('reduite')).toBe(true);
    // Default and car modes never take the ladder.
    expect(rendre('salon', sansRangee).querySelector('.synthese')!.classList.contains('reduite'))
      .toBe(false);
    const voiture = rendre('bureau', { ...avecRangee, blocDefaut: 'voiture' });
    expect(voiture.querySelector('.synthese')!.classList.contains('reduite')).toBe(false);
    expect(voiture.querySelector('[data-zone="rangeeAmbiance"]')).not.toBeNull();
  });

  it('a screen with room keeps its Ambiance row, and only reduces what it must', () => {
    const haut = rendre('bureau', { ...avecRangee, sourceJoue: true, hauteurUtile: 679 });
    expect(haut.querySelector('[data-zone="rangeeAmbiance"]')).not.toBeNull();
    expect(haut.querySelector('.synthese')!.classList.contains('reduite')).toBe(true);
  });

  it('without a context, the full composition as before', () => {
    const hote = document.createElement('div');
    render(rendreCorps(new Etat(), ECRANS.bureau, BLOC), hote);
    expect(hote.querySelector('[data-zone="rangeeAmbiance"]')).not.toBeNull();
    expect(hote.querySelector('.synthese')!.classList.contains('reduite')).toBe(false);
  });
});
