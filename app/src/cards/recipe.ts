/** The recipe card (rank 0): the recipe in progress, collapsed. It replaces the collapsed
 *  recipe block the home view had (card-stack task 6): the current step and, when one runs, the
 *  countdown of the most urgent timer. Its button reopens the `#recette` view. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { CardFrame } from '../rendu/card-frame';
import { ligneEtape } from '../rendu/defaut';
import { etapeSource } from '../rendu/recette';
import type { Card } from '../stack/types';
import { S } from './strings';

export function detect(f: Frame, s: ScreenState): Card[] {
  return f.ctx.recetteEnCours && s.recetteUid !== null
    ? [{ key: `recette:${s.recetteUid}`, type: 'recette', rank: 0 }] : [];
}

export function frame(card: Card, f: Frame, s: ScreenState): CardFrame {
  const line = ligneEtape({
    ...etapeSource(s.pageSourceIndex, s.pageRecette),
    ...(f.minuteurActif ? { restantS: f.minuteurActif.restantS } : {}),
  });
  return {
    key: card.key,
    label: S.recipe,
    title: s.platRecette || S.recipeFallback,
    middle: html`<div class="recette-etape">${line}</div>`,
    buttons: [undefined,
      { icon: 'book', label: S.recipeOpen, primary: true, act: () => { location.hash = '#recette'; } },
      undefined],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:recette' },
  };
}
