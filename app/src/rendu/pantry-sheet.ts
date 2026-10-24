/** The sheet of one pantry batch (spec 2026-09-28 §2): what is left, how much to take out (the
 *  Tout / half / quarter shortcuts, then − / +) and why (eaten, thrown away, expired).
 *
 *  Four rows of 64 px (`SHEET_ROWS`), inside the same frame as the lists: the budget is checked by
 *  arithmetic in tests/pantry-render.test.ts. The reasons take the two-press arming of
 *  `boot/pantry.ts`: the armed button turns to the error tone of an armed task
 *  (`.ligne-tache.armee`) and says so. Offline, the three are greyed out and inert. */
import { html, type TemplateResult } from 'lit';
import { pantryActions as act } from './pantry-actions';
import { pantryFrame, shortDate, type PantryView } from './pantry-frame';
import { fromFraction, formatQuantity, type Fraction } from '../pantry/quantity';
import { REASON_LABELS, type Reason } from '../boot/pantry';

/** Header, fractions, − / +, reasons. */
export const SHEET_ROWS = 4;

const FRACTIONS: [Fraction, string][] = [['all', 'Tout'], ['half', '½'], ['quarter', '¼']];
const REASONS: Reason[] = ['consumption', 'discard', 'expired'];

export function renderSheet(v: PantryView): TemplateResult {
  const p = v.state;
  const b = p.selected!;
  const where = [b.location, b.aisle].filter((x) => x !== null).join(' · ');
  const details = [`Reste ${formatQuantity(b.remaining, b.unit)}`,
                   b.bestBefore ? `DLC ${shortDate(b.bestBefore)}` : '', where]
    .filter((x) => x !== '').join(' · ');
  const inert = v.horsLigne || p.sending;
  // Locked to a send whose outcome is unknown: only that reason can be confirmed again, with the
  // same quantity — a replay home-stock recognises (see `unresolved`, boot/pantry.ts).
  const locked = p.retry !== undefined || p.sending;
  const reasonInert = (r: Reason) => inert || (p.retry !== undefined && r !== p.retry.reason);
  const armedAny = REASONS.some((r) => v.armed(r));
  const label = p.message ?? (armedAny ? 'Confirmer — non réversible' : 'Sortir du stock');
  const left = formatQuantity(b.remaining - p.quantity, b.unit);
  return pantryFrame(v, label, html`
    <div class="pantry-fiche">
      <div class="pantry-rangee pantry-entete">
        <div class="t">${b.product}</div><div class="s">${details}</div>
      </div>
      <div class="pantry-rangee pantry-fractions">
        ${FRACTIONS.map(([f, text]) => html`
          <div class="pantry-fraction ${p.quantity === fromFraction(f, b.remaining) ? 'choisie' : ''} ${locked ? 'inactif' : ''}"
               @pointerdown=${() => { if (!locked) act.chooseFraction(f); }}>${text}</div>`)}
      </div>
      <div class="pantry-rangee pantry-pas">
        <div class="pantry-moins ${locked ? 'inactif' : ''}" @pointerdown=${() => { if (!locked) act.step(-1); }}>−</div>
        <div class="pantry-live">Sortir ${formatQuantity(p.quantity, b.unit)} · il restera ${left}</div>
        <div class="pantry-plus ${locked ? 'inactif' : ''}" @pointerdown=${() => { if (!locked) act.step(1); }}>+</div>
      </div>
      <div class="pantry-rangee pantry-motifs">
        ${REASONS.map((r) => {
          const armed = v.armed(r);
          return html`
          <div class="pantry-reason ${r === 'consumption' ? 'principal' : ''} ${armed ? 'armee' : ''} ${reasonInert(r) ? 'inactif' : ''}"
               @pointerdown=${() => { if (!reasonInert(r)) act.press(r); }}>
            <div class="t">${REASON_LABELS[r]}</div>${armed ? html`<div class="s">Toucher pour confirmer</div>` : ''}
          </div>`;
        })}
      </div>
    </div>`);
}
