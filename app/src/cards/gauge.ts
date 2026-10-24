/** One flat gauge of a card: a name from Home Assistant and its percentage over a track. The plants
 *  card's; the colours are the stack's own disc/icon pair (`reminders.css`). */
import { html } from 'lit';
import { percent } from './format';

export function gauge(name: string | undefined, value: number) {
  const fill = Math.min(100, Math.max(0, value));
  return html`<div class="jauge">
    <div class="jauge-tete">
      <span class="carte-ligne" dir="auto">${name ?? ''}</span>
      <span class="jauge-valeur">${percent(value)}</span>
    </div>
    <div class="jauge-piste"><div class="jauge-niveau" style="width:${fill}%"></div></div>
  </div>`;
}

/** The same gauge on ONE line (name, track, percentage), for a card that lists up to five of them:
 *  the ink card, where a printer has up to five cartridges and the stacked gauge would not fit. */
export function gaugeRow(name: string | undefined, value: number) {
  const fill = Math.min(100, Math.max(0, value));
  return html`<div class="jauge-ligne">
    <span class="carte-ligne" dir="auto">${name ?? ''}</span>
    <div class="jauge-piste"><div class="jauge-niveau" style="width:${fill}%"></div></div>
    <span class="jauge-valeur">${percent(value)}</span>
  </div>`;
}
