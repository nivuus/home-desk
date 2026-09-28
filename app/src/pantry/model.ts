/** The pantry of the kitchen tablet, as data: the open batches home-stock returns
 *  (`home_stock/batches/list`), grouped by location then aisle, sorted by best-before date and cut
 *  into pages of six rows. PURE — no DOM, no Home Assistant — like `cochage.ts`: everything here is
 *  testable without a browser, and the views (`rendu/pantry-lists.ts`) only lay it out. */

export type Batch = {
  id: number; productId: number; product: string; remaining: number;
  /** home-stock's `base_unit`: 'g', 'ml' or 'piece'. */
  unit: string;
  /** ISO date, or null when the batch has no best-before date (or an unreadable one). */
  bestBefore: string | null;
  locationId: number; location: string; locationPosition: number;
  aisleId: number | null; aisle: string | null; aislePosition: number | null;
};

/** A location as `home_stock/locations/list` returns it — the only way to know an EMPTY one, since
 *  `batches/list` only carries open batches. */
export type KnownLocation = { id: number; name: string; position: number };

/** The label of the products that have no aisle. Shown last, never dropped. */
export const NO_AISLE = 'Sans rayon';

/** Six rows of 64 px per page, the budget of every list view of the app (see `cochage.ts`,
 *  `MAX_LIGNES_TACHES`). */
export const PAGE_ROWS = 6;

/** Marks the batches parsed from a home-stock that sends the aisle fields. Kept off the `Batch`
 *  type itself so that a batch stays a plain comparable record. */
const WITH_AISLES = new WeakSet<Batch>();

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';
const optNum = (v: unknown): number | null => (isNum(v) ? v : null);

/** An ISO date `YYYY-MM-DD` (optionally followed by a time) that actually parses — anything else
 *  reads as "no date", so the screen can never print "Invalid Date". */
function readDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  return Number.isNaN(Date.parse(v.slice(0, 10))) ? null : v.slice(0, 10);
}

function readRows(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  const list = (raw as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(list) ? list : [];
}

/** Parses the answer of `home_stock/batches/list` (the object or its `batches` array). Never
 *  throws; a row missing an id, a product, a location or a numeric quantity is dropped. */
export function parseBatches(raw: unknown): Batch[] {
  const out: Batch[] = [];
  for (const r of readRows(raw, 'batches')) {
    if (r === null || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (!isNum(o.id) || !isNum(o.product_id) || !isNum(o.remaining) || !isNum(o.location_id)) continue;
    const batch: Batch = {
      id: o.id, productId: o.product_id,
      product: isText(o.product_name) ? o.product_name : 'Produit',
      remaining: o.remaining,
      unit: isText(o.base_unit) ? o.base_unit : '',
      bestBefore: readDate(o.best_before),
      locationId: o.location_id,
      location: isText(o.location_name) ? o.location_name : 'Emplacement',
      locationPosition: isNum(o.location_position) ? o.location_position : 0,
      aisleId: optNum(o.aisle_id),
      aisle: isText(o.aisle_name) ? o.aisle_name : null,
      aislePosition: optNum(o.aisle_position),
    };
    if ('aisle_id' in o) WITH_AISLES.add(batch);
    out.push(batch);
  }
  return out;
}

/** Parses the answer of `home_stock/locations/list`. Never throws. */
export function parseLocations(raw: unknown): KnownLocation[] {
  const out: KnownLocation[] = [];
  for (const r of readRows(raw, 'locations')) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (!isNum(o.id) || !isText(o.name)) continue;
    out.push({ id: o.id, name: o.name, position: isNum(o.position) ? o.position : 0 });
  }
  return out;
}

/** False when home-stock predates the aisle fields: the aisle level is then skipped. */
export function hasAisles(batches: Batch[]): boolean {
  return batches.some((b) => WITH_AISLES.has(b));
}

const byText = (a: string, b: string) => a.localeCompare(b, 'fr');

export type LocationGroup = { locationId: number; name: string; count: number };

/** One group per location, by location position then name. `known` (from
 *  `home_stock/locations/list`) adds the empty locations with a zero count; without it, only the
 *  locations seen in the batches are listed. */
export function locations(batches: Batch[], known: KnownLocation[] = []): LocationGroup[] {
  const groups = new Map<number, LocationGroup & { position: number }>();
  for (const k of known) groups.set(k.id, { locationId: k.id, name: k.name, count: 0, position: k.position });
  for (const b of batches) {
    const g = groups.get(b.locationId);
    if (g) g.count++;
    else groups.set(b.locationId, { locationId: b.locationId, name: b.location, count: 1, position: b.locationPosition });
  }
  return [...groups.values()]
    .sort((a, b) => a.position - b.position || byText(a.name, b.name))
    .map(({ locationId, name, count }) => ({ locationId, name, count }));
}

export type AisleGroup = { aisleId: number | null; name: string; count: number };

/** The non-empty aisles of one location, by aisle position then name; the products without an
 *  aisle are grouped under "Sans rayon", always last. */
export function aislesOf(batches: Batch[], locationId: number): AisleGroup[] {
  const groups = new Map<number | null, AisleGroup & { position: number }>();
  for (const b of batches) {
    if (b.locationId !== locationId) continue;
    const key = b.aisleId;
    const g = groups.get(key);
    if (g) { g.count++; continue; }
    groups.set(key, {
      aisleId: key, name: key === null ? NO_AISLE : (b.aisle ?? NO_AISLE), count: 1,
      position: key === null ? Number.POSITIVE_INFINITY : (b.aislePosition ?? Number.MAX_SAFE_INTEGER),
    });
  }
  return [...groups.values()]
    .sort((a, b) => a.position - b.position || byText(a.name, b.name))
    .map(({ aisleId, name, count }) => ({ aisleId, name, count }));
}

export type BatchFilter = { locationId?: number; aisleId?: number | null; ids?: Set<number> };

/** The batches matching the filter (an absent key filters nothing; `aisleId: null` means the
 *  products without aisle), by best-before date — undated last — then product name. */
export function batchesOf(batches: Batch[], f: BatchFilter): Batch[] {
  return batches
    .filter((b) => (f.locationId === undefined || b.locationId === f.locationId)
      && (f.aisleId === undefined || b.aisleId === f.aisleId)
      && (f.ids === undefined || f.ids.has(b.id)))
    .sort((a, b) => {
      if (a.bestBefore !== b.bestBefore) {
        if (a.bestBefore === null) return 1;
        if (b.bestBefore === null) return -1;
        return a.bestBefore < b.bestBefore ? -1 : 1;
      }
      return byText(a.product, b.product) || a.id - b.id;
    });
}

/** Page `index` of a list shown on `PAGE_ROWS` rows. Up to six items fit on one page; beyond,
 *  every page but the last shows five items and a sixth "Suite › (more)" row, `more` being the
 *  number of items after this page. */
export function page<T>(items: T[], index: number): { rows: T[]; more: number } {
  const start = index * (PAGE_ROWS - 1);
  const left = items.length - start;
  if (left <= PAGE_ROWS) return { rows: items.slice(start), more: 0 };
  return { rows: items.slice(start, start + PAGE_ROWS - 1), more: left - (PAGE_ROWS - 1) };
}
