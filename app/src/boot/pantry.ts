/** The pantry view of the kitchen tablet (`#garde-manger`): loading the stock from home-stock, the
 *  navigation between its levels, and taking a batch out of stock (spec 2026-09-28 §1–§2).
 *
 *  Every function works on a narrow `PantryHost` — `ScreenState` satisfies it structurally — and
 *  none of them renders: they end with `s.dessiner()` when the screen must change, like
 *  `boot/recipe.ts`.
 *
 *  Taking out of stock is IRREVERSIBLE from the wall, hence the same two-press arming as
 *  "Terminer" (`createArming`, never a long press), and NO optimistic removal: nothing leaves the
 *  screen before home-stock has confirmed. */
import { RefusHA } from '../connexion';
import type { createArming } from '../cochage';
import {
  parseBatches, parseLocations, hasAisles, aislesOf, batchesOf, page,
  type Batch, type KnownLocation,
} from '../pantry/model';
import { fromFraction, increment, formatQuantity, type Fraction } from '../pantry/quantity';
import type { ConnexionLike } from './types';

export type Reason = 'consumption' | 'discard' | 'expired';
export type PantryLevel = 'entry' | 'aisles' | 'batches' | 'sheet';

export type PantryState = {
  /** The `todo.*` list whose `uid`s are the ids of the batches to eat soon — home-stock's own
   *  threshold, defined there only. Read from the screen configuration (the pantry tile's
   *  `entite`), never written here. */
  soonList: string | undefined;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'empty';
  batches: Batch[];
  known: KnownLocation[];
  soonIds: Set<number>;
  level: PantryLevel;
  locationId?: number;
  /** `undefined`: every aisle of the location; `null`: the products without aisle. */
  aisleId?: number | null;
  soon?: boolean;
  pageIndex: number;
  selected?: Batch;
  quantity: number;
  /** What home-stock answered to a refused or unanswered consumption, shown on the sheet. */
  message?: string;
  /** "Mangé : 175 g de Yaourt nature", shown briefly after a confirmed consumption. */
  banner?: string;
  /** Drawn at the first arming of a sheet, kept until success or Back: a retry after a silence
   *  reuses it, and home-stock then never counts the same consumption twice. */
  pendingKey?: string;
  sending: boolean;
  loadToken: number;
  bannerToken: number;
};

export type PantryHost = {
  cx: Pick<ConnexionLike, 'envoyerCommande' | 'listerTaches'>;
  horsLigne: boolean;
  pantry: PantryState;
  armementStock: ReturnType<typeof createArming>;
  d: { minuteurFn: typeof setTimeout };
  dessiner: () => void;
};

export const SILENCE_MESSAGE = 'home-stock ne répond pas — rien n’a été retiré';
const REFUSAL_FALLBACK = 'home-stock a refusé — rien n’a été retiré';
const BANNER_MS = 4000;

export const REASON_LABELS: Record<Reason, string> = {
  consumption: 'Mangé', discard: 'Jeté', expired: 'Périmé',
};

export function newPantryState(soonList?: string): PantryState {
  return {
    soonList, status: 'idle', batches: [], known: [], soonIds: new Set(), level: 'entry',
    pageIndex: 0, quantity: 0, sending: false, loadToken: 0, bannerToken: 0,
  };
}

async function optional<T>(p: () => Promise<T>, fallback: T): Promise<T> {
  try { return await p(); } catch { return fallback; }
}

/** Reads the stock, ONCE — on opening the view and after each confirmed consumption, never
 *  periodically. Never throws: a failed read shows "Garde-manger indisponible", never a blank
 *  screen. The locations (to show the empty ones) and the soon list are optional: without them the
 *  view still works, only less informed. */
export async function loadPantry(s: PantryHost): Promise<void> {
  const p = s.pantry;
  const mine = ++p.loadToken;
  if (p.status !== 'ready') { p.status = 'loading'; s.dessiner(); }
  let raw: unknown;
  try {
    raw = await s.cx.envoyerCommande({ type: 'home_stock/batches/list' });
  } catch {
    if (mine !== p.loadToken) return;
    p.status = 'error';
    s.dessiner();
    return;
  }
  const [known, soon] = await Promise.all([
    optional(() => s.cx.envoyerCommande({ type: 'home_stock/locations/list' }), undefined),
    p.soonList ? optional(() => s.cx.listerTaches(p.soonList as string), []) : Promise.resolve([]),
  ]);
  if (mine !== p.loadToken) return;
  p.batches = parseBatches(raw);
  p.known = parseLocations(known);
  p.soonIds = new Set(soon.map((t) => Number(t.uid)).filter((n) => Number.isInteger(n)));
  p.status = p.batches.length === 0 ? 'empty' : 'ready';
  settleLevel(s);
  s.dessiner();
}

/** The batches the `batches` level currently lists. */
export function currentBatches(p: PantryState): Batch[] {
  if (p.soon) return batchesOf(p.batches, { ids: p.soonIds });
  return batchesOf(p.batches, { locationId: p.locationId, aisleId: p.aisleId });
}

/** Whether a location is browsed through its aisles: only when home-stock sends them and the
 *  location has more than one — a single aisle is a level with one tile, skipped. */
function browsesAisles(p: PantryState, locationId: number): boolean {
  return hasAisles(p.batches) && aislesOf(p.batches, locationId).length > 1;
}

/** After a reload, a level may have emptied (the last batch of an aisle was eaten): climb until
 *  something is left to show, and keep the page within range. */
function settleLevel(s: PantryHost): void {
  const p = s.pantry;
  if (p.level !== 'batches') return;
  const items = currentBatches(p);
  if (items.length === 0) { leaveBatches(p); return; }
  while (p.pageIndex > 0 && page(items, p.pageIndex).rows.length === 0) p.pageIndex--;
}

function leaveBatches(p: PantryState): void {
  const viaAisles = !p.soon && p.aisleId !== undefined && p.locationId !== undefined
    && browsesAisles(p, p.locationId);
  p.level = viaAisles ? 'aisles' : 'entry';
  p.aisleId = undefined;
  p.soon = undefined;
  p.pageIndex = 0;
  if (!viaAisles) p.locationId = undefined;
}

/** Any navigation clears the banner of the previous consumption. */
function navigated(s: PantryHost): void {
  s.pantry.banner = undefined;
  s.dessiner();
}

export function openLocation(s: PantryHost, locationId: number): void {
  const p = s.pantry;
  if (!p.batches.some((b) => b.locationId === locationId)) return;   // an empty location is inert
  p.locationId = locationId;
  p.aisleId = undefined;
  p.soon = undefined;
  p.pageIndex = 0;
  p.level = browsesAisles(p, locationId) ? 'aisles' : 'batches';
  navigated(s);
}

export function openAisle(s: PantryHost, aisleId: number | null): void {
  const p = s.pantry;
  p.aisleId = aisleId;
  p.pageIndex = 0;
  p.level = 'batches';
  navigated(s);
}

export function openSoon(s: PantryHost): void {
  const p = s.pantry;
  if (currentBatches({ ...p, soon: true }).length === 0) return;
  p.soon = true;
  p.locationId = undefined;
  p.aisleId = undefined;
  p.pageIndex = 0;
  p.level = 'batches';
  navigated(s);
}

export function nextPage(s: PantryHost): void {
  const p = s.pantry;
  if (page(currentBatches(p), p.pageIndex).more === 0) return;
  p.pageIndex++;
  navigated(s);
}

export function openBatch(s: PantryHost, batch: Batch): void {
  const p = s.pantry;
  p.selected = batch;
  p.quantity = fromFraction('all', batch.remaining);
  p.message = undefined;
  p.pendingKey = undefined;
  p.level = 'sheet';
  s.armementStock.desarmer();
  navigated(s);
}

/** One level up. From the entry, leaves the view (the home screen). */
export function back(s: PantryHost): void {
  const p = s.pantry;
  s.armementStock.desarmer();
  if (p.level === 'sheet') {
    p.level = 'batches';
    p.selected = undefined;
    p.pendingKey = undefined;
    p.message = undefined;
  } else if (p.level === 'batches') {
    if (p.pageIndex > 0) p.pageIndex--;
    else leaveBatches(p);
  } else if (p.level === 'aisles') {
    p.level = 'entry';
    p.locationId = undefined;
  } else {
    location.hash = '';
  }
  navigated(s);
}

export function chooseFraction(s: PantryHost, f: Fraction): void {
  const p = s.pantry;
  if (!p.selected) return;
  p.quantity = fromFraction(f, p.selected.remaining);
  s.dessiner();
}

export function stepQuantity(s: PantryHost, dir: 1 | -1): void {
  const p = s.pantry;
  if (!p.selected) return;
  p.quantity = increment(p.quantity, p.selected.remaining, p.selected.unit, dir);
  s.dessiner();
}

function newKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `mur-${c.randomUUID()}`;
  return `mur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** "de Yaourt", "d’Abricots": French elides "de" before a vowel. Not before a y ("de yaourt")
 *  nor an h, which may be aspirated ("de haricots") — no elision is the safe default. */
function ofProduct(name: string): string {
  // French elision rules, applied to a French UI sentence.
  return /^[aeiouàâäéèêëîïôöùûüœæ]/i.test(name) ? `d’${name}` : `de ${name}`;   // policy: allow-fr
}

/** A refusal from home-stock (translated into French there) — as opposed to a silence: the
 *  timeout of `envoyerCommande` (`delai_depasse`) or a connection gone. */
function refusalMessage(e: unknown): string | undefined {
  if (!(e instanceof RefusHA) || e.code === 'delai_depasse') return undefined;
  return e.message.trim() !== '' ? e.message : REFUSAL_FALLBACK;
}

function showBanner(s: PantryHost, text: string): void {
  const p = s.pantry;
  const mine = ++p.bannerToken;
  p.banner = text;
  s.d.minuteurFn(() => {
    if (mine !== p.bannerToken || p.banner !== text) return;
    p.banner = undefined;
    s.dessiner();
  }, BANNER_MS);
}

/** "Mangé", "Jeté" or "Périmé": the first press arms, the second sends
 *  `home_stock/stock/consume` for the selected batch. Offline: nothing is armed, nothing is sent
 *  (the buttons are greyed out, see `rendu/pantry-sheet.ts`). */
export async function pressReason(s: PantryHost, reason: Reason): Promise<void> {
  const p = s.pantry;
  if (s.horsLigne || p.level !== 'sheet' || !p.selected || p.sending) return;
  if (!s.armementStock.estArmee(reason)) {
    p.pendingKey ??= newKey();
    s.armementStock.armer(reason, s.dessiner);
    s.dessiner();
    return;
  }
  s.armementStock.desarmer();
  const batch = p.selected;
  const quantity = p.quantity;
  p.sending = true;
  p.message = undefined;
  s.dessiner();
  try {
    await s.cx.envoyerCommande({
      type: 'home_stock/stock/consume', product_id: batch.productId, batch_id: batch.id,
      quantity, reason, idempotency_key: p.pendingKey,
    });
  } catch (e) {
    p.sending = false;
    p.message = refusalMessage(e) ?? SILENCE_MESSAGE;
    s.dessiner();
    return;
  }
  p.sending = false;
  p.selected = undefined;
  p.pendingKey = undefined;
  p.level = 'batches';
  showBanner(s, `${REASON_LABELS[reason]} : ${formatQuantity(quantity, batch.unit)} ${ofProduct(batch.product)}`);
  s.dessiner();
  await loadPantry(s);
}
