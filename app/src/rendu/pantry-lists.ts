/** The pantry view of the kitchen tablet (`#garde-manger`, spec 2026-09-28): its list levels —
 *  entry, aisles of a location, batches — and its status screens. The sheet of one batch lives in
 *  `pantry-sheet.ts`.
 *
 *  Same frame as the "Tâches" view (`rendu/taches.ts`): `.corps`, a label, at most six rows of
 *  64 px (`.ligne-tache`), a Back button. Never scrolls: beyond six items, the sixth row becomes
 *  "Suite › (N)" (`page`, `pantry/model.ts`). */
import { html, type TemplateResult } from 'lit';
import { pantryActions as act } from './pantry-actions';
import { pantryFrame, shortDate, type PantryView } from './pantry-frame';
import { renderSheet, SHEET_ROWS } from './pantry-sheet';
import { locations, aislesOf, page, type Batch } from '../pantry/model';
import { formatQuantity } from '../pantry/quantity';
import { currentBatches, type PantryState } from '../boot/pantry';

export { wirePantry } from './pantry-actions';
export { SHEET_ROWS };
export type { PantryView };

type Row = { key: string; title: string; sub?: TemplateResult | string; inert?: boolean; press?: () => void };

const lots = (n: number) => (n === 0 ? 'Vide' : `${n} lot${n > 1 ? 's' : ''}`);

function batchSub(b: Batch, v: PantryView): TemplateResult {
  const qty = formatQuantity(b.remaining, b.unit);
  if (b.bestBefore === null) return html`${qty}`;
  const cls = b.bestBefore < v.today ? 'perime' : v.state.soonIds?.has(b.id) ? 'bientot' : '';
  return html`${qty} · <span class="${cls}">${shortDate(b.bestBefore)}</span>`;
}

function rows(items: Row[], pageIndex: number): TemplateResult {
  const { rows: visible, more } = page(items, pageIndex);
  return html`
    <div class="taches-liste">
      ${visible.map((r) => html`
        <div class="ligne-tache ${r.inert ? 'inactif' : ''}" data-mvt="ligne:${r.key}"
             @pointerdown=${() => { if (!r.inert) r.press?.(); }}>
          <div><div class="t">${r.title}</div>${r.sub !== undefined ? html`<div class="s">${r.sub}</div>` : ''}</div>
        </div>`)}
      ${more > 0 ? html`
        <div class="ligne-tache suite" data-mvt="detail:garde-manger-suite" @pointerdown=${() => act.nextPage()}>
          <div><div class="t">Suite › (${more})</div></div>
        </div>` : ''}
    </div>`;
}

function entry(v: PantryView): TemplateResult {
  const p = v.state;
  // A soon list that could not be read is said, never shown as an empty list.
  const soon = p.soonIds === null ? null : currentBatches({ ...p, soon: true }).length;
  const items: Row[] = [
    { key: 'soon', title: soon === null ? 'À consommer vite — indisponible' : `À consommer vite (${soon})`,
      inert: !soon, press: () => act.openSoon() },
    ...locations(p.batches, p.known).map((l) => ({
      key: `loc-${l.locationId}`, title: l.name, sub: lots(l.count), inert: l.count === 0,
      press: () => act.openLocation(l.locationId),
    })),
  ];
  return pantryFrame(v, 'Garde-manger', rows(items, p.pageIndex));
}

function locationName(p: PantryState): string {
  return locations(p.batches, p.known).find((l) => l.locationId === p.locationId)?.name ?? 'Garde-manger';
}

function aisles(v: PantryView): TemplateResult {
  const p = v.state;
  const items: Row[] = aislesOf(p.batches, p.locationId ?? -1).map((a) => ({
    key: `aisle-${a.aisleId ?? 'none'}`, title: a.name, sub: lots(a.count),
    press: () => act.openAisle(a.aisleId),
  }));
  return pantryFrame(v, locationName(p), rows(items, p.pageIndex));
}

function batches(v: PantryView): TemplateResult {
  const p = v.state;
  const aisle = p.aisleId === undefined ? undefined
    : aislesOf(p.batches, p.locationId ?? -1).find((a) => a.aisleId === p.aisleId)?.name;
  const label = p.soon ? 'À consommer vite' : aisle ? `${locationName(p)} · ${aisle}` : locationName(p);
  const items: Row[] = currentBatches(p).map((b) => ({
    key: `lot-${b.id}`, title: b.product, sub: batchSub(b, v), press: () => act.openBatch(b),
  }));
  return pantryFrame(v, label, rows(items, p.pageIndex));
}

/** A status screen: one explanatory row, never a blank view. */
function status(v: PantryView, text: string, retry: boolean): TemplateResult {
  const items: Row[] = [{ key: 'status', title: text, inert: true }];
  if (retry) items.push({ key: 'retry', title: 'Réessayer', press: () => act.retry() });
  return pantryFrame(v, 'Garde-manger', rows(items, 0));
}

export function renderPantry(v: PantryView): TemplateResult {
  const p = v.state;
  if (p.status === 'error') return status(v, 'Garde-manger indisponible', true);
  if (p.status === 'empty') return status(v, 'Rien en stock', false);
  if (p.status !== 'ready') return status(v, 'Chargement…', false);
  if (p.level === 'sheet' && p.selected) return renderSheet(v);
  if (p.level === 'aisles') return aisles(v);
  if (p.level === 'batches') return batches(v);
  return entry(v);
}
