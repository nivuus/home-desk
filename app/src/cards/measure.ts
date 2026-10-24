/** A reading an entity publishes, as the card writes it: the number through `Intl` in the page's
 *  locale, then the unit the ENTITY declares (`unit_of_measurement`, text from Home Assistant, so
 *  `dir="auto"` where it is drawn) — a card never assumes km, steps or µg/m³. */
import { html } from 'lit';
import type { ScreenState } from '../boot/state';
import { numberOf } from './format';
import { attributeOf, stateOf } from './readings';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/** The value of a sensor, or null when it is absent or not a number. */
export const valueOf = (s: ScreenState, id: string | undefined): number | null => numberOf(stateOf(s.etat, id));

/** `value` and its unit as two spans (a text node of the line itself would be a second text box). */
export function reading(s: ScreenState, id: string | undefined, value: number | null = valueOf(s, id)) {
  if (value === null) return undefined;
  const unit = attributeOf(s.etat, id, 'unit_of_measurement');
  return html`<span>${number.format(value)}</span>${typeof unit === 'string' && unit !== ''
    ? html`<span dir="auto">${' '}${unit}</span>` : ''}`;
}
