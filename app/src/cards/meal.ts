/** The meal card (rank 5): the next planned meal, during the hour before it. Screen-sourced like
 *  the recipe card: the data is what the screen already reads (`currentMeal`), the card exists
 *  only on a screen that declares the recipe view (the kitchen's "Recette" command).
 *
 *  Window: [meal time − 60 min, meal time). The time is the calendar's `start_time`
 *  (`mealStartMs`), the clock `f.maintenantMs`; no calendar time, no card. After the meal time the
 *  card is gone; validating the meal moves the sensor to the next one, outside the window.
 *
 *  Buttons: shopping opens the tasks view when the screen lists the shopping list; open the
 *  recipe (primary) only when the meal has one; validate runs the house's script when it is
 *  readable. A slot without its source stays empty. The picture is the sensor's `entity_picture`
 *  when it has one, through `imageToPaint`; otherwise a neutral colour. */
import { html } from 'lit';
import { imageToPaint } from '../boot/card-tones';
import type { Frame } from '../boot/frame';
import { currentMeal } from '../boot/recipe';
import type { ScreenState } from '../boot/state';
import { CAPTEUR_REPAS, SCRIPT_VALIDER_REPAS, mealStartMs } from '../garde-manger';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import type { Card } from '../stack/types';
import { cardAct } from './actions';
import { clockTime } from './format';
import { declaresView, shoppingButton } from './kitchen';
import { stateOf } from './readings';
import { S } from './strings';

const WINDOW_MS = 60 * 60_000;

const keyOf = (): string => `repas:${CAPTEUR_REPAS}`;

function startIfInWindow(f: Frame, s: ScreenState): number | null {
  if (!declaresView(s, '#recette') || currentMeal(s) === undefined) return null;
  const start = mealStartMs(s.etat);
  return start !== null && f.maintenantMs >= start - WINDOW_MS && f.maintenantMs < start ? start : null;
}

export function detect(f: Frame, s: ScreenState): Card[] {
  return startIfInWindow(f, s) === null ? [] : [{ key: keyOf(), type: 'repas', rank: 5 }];
}

export function frame(card: Card, f: Frame, s: ScreenState): CardFrame {
  const meal = currentMeal(s);
  const start = startIfInWindow(f, s);
  if (meal === undefined || start === null) throw new Error(`meal card: no meal in its window for ${card.key}`);
  const missing = meal.manquants > 0
    ? html`<div class="carte-ligne repas-manquants plaque" data-tone-box>${S.mealMissing(new Intl.NumberFormat().format(meal.manquants))}</div>` : '';
  const recipe: CardButton | undefined = meal.recetteId === null ? undefined
    : { icon: 'book', label: S.mealOpenRecipe, primary: true, act: () => { location.hash = '#recette'; } };
  const validate: CardButton | undefined = stateOf(s.etat, SCRIPT_VALIDER_REPAS) === undefined ? undefined
    : { icon: 'coche', label: S.mealValidate, act: () => cardAct('script', 'turn_on', SCRIPT_VALIDER_REPAS) };
  return {
    key: card.key,
    label: S.meal,
    title: meal.plat,
    middle: html`<div class="carte-ligne plaque" data-tone-box>${clockTime(start)}</div>${missing}`,
    buttons: [shoppingButton(s), recipe, validate],
    ...(meal.image ? imageToPaint(card.key, meal.image, s.measuredCard)
      : { background: { kind: 'solid' as const, token: 'neutral' as const } }),
    motion: { block: 'bloc:repas' },
  };
}
