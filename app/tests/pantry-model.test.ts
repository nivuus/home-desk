// The pantry model of the kitchen tablet: parsing `home_stock/batches/list`, grouping by location
// then aisle, sorting by best-before date, and paginating on six rows. Pure functions, no DOM.
import { describe, it, expect } from 'vitest';
import {
  parseBatches, parseLocations, hasAisles, locations, aislesOf, batchesOf, page, PAGE_ROWS,
  type Batch,
} from '../src/pantry/model';

/** A raw row as home-stock sends it (with the aisle fields, home-stock >= this change). */
function row(o: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 1, remaining: 500, best_before: null, entered_at: '2026-09-01T10:00:00', opened_at: null,
    product_id: 1, product_name: 'Produit', base_unit: 'g',
    location_id: 1, location_name: 'Frigo', location_position: 1,
    aisle_id: null, aisle_name: null, aisle_position: null,
    ...o,
  };
}

// Two locations × two aisles, plus one product without aisle in the fridge.
const RAW = [
  row({ id: 11, product_id: 1, product_name: 'Yaourt', best_before: '2026-10-05',
        aisle_id: 5, aisle_name: 'Crémerie', aisle_position: 5 }),
  row({ id: 12, product_id: 2, product_name: 'Carottes', best_before: '2026-10-01',
        aisle_id: 1, aisle_name: 'Fruits et légumes', aisle_position: 1 }),
  row({ id: 13, product_id: 3, product_name: 'Restes', best_before: null }),
  row({ id: 14, product_id: 4, product_name: 'Beurre', best_before: '2026-09-30',
        aisle_id: 5, aisle_name: 'Crémerie', aisle_position: 5 }),
  row({ id: 21, product_id: 5, product_name: 'Pâtes', location_id: 3, location_name: 'Placard',
        location_position: 3, aisle_id: 8, aisle_name: 'Épicerie salée', aisle_position: 8 }),
  row({ id: 22, product_id: 6, product_name: 'Riz', location_id: 3, location_name: 'Placard',
        location_position: 3, aisle_id: 8, aisle_name: 'Épicerie salée', aisle_position: 8,
        best_before: '2027-01-01' }),
];

describe('parseBatches', () => {
  it('maps every field of a well-formed row', () => {
    const [b] = parseBatches([RAW[0]]);
    expect(b).toEqual<Batch>({
      id: 11, productId: 1, product: 'Yaourt', remaining: 500, unit: 'g',
      bestBefore: '2026-10-05', locationId: 1, location: 'Frigo', locationPosition: 1,
      aisleId: 5, aisle: 'Crémerie', aislePosition: 5,
    });
  });

  it('drops malformed rows without throwing', () => {
    const parsed = parseBatches([RAW[0], null, 'x', { id: 'a' }, row({ remaining: 'lots' }),
                                 row({ product_id: undefined }), RAW[4]]);
    expect(parsed.map((b) => b.id)).toEqual([11, 21]);
    expect(parseBatches(undefined)).toEqual([]);
    expect(parseBatches({ batches: 'nope' })).toEqual([]);
  });

  it('never keeps an unparseable date: a garbage best_before reads as no date', () => {
    const [b] = parseBatches([row({ best_before: 'soon' })]);
    expect(b.bestBefore).toBeNull();
  });
});

describe('hasAisles', () => {
  it('is true when the server sends the aisle fields, even all null', () => {
    expect(hasAisles(parseBatches(RAW))).toBe(true);
    expect(hasAisles(parseBatches([row({})]))).toBe(true);
  });

  it('is false for a home-stock older than the aisle fields', () => {
    const old = RAW.map(({ aisle_id: _a, aisle_name: _n, aisle_position: _p, location_position: _l, ...r }) => r);
    const parsed = parseBatches(old);
    expect(parsed).toHaveLength(RAW.length);
    expect(hasAisles(parsed)).toBe(false);
  });
});

describe('locations', () => {
  const batches = parseBatches(RAW);

  it('counts batches per location, in location position order', () => {
    expect(locations(batches)).toEqual([
      { locationId: 1, name: 'Frigo', count: 4 },
      { locationId: 3, name: 'Placard', count: 2 },
    ]);
  });

  it('includes the known empty locations with a zero count, in position order', () => {
    const known = parseLocations({ locations: [
      { id: 3, name: 'Placard', position: 3 }, { id: 2, name: 'Congélateur', position: 2 },
      { id: 1, name: 'Frigo', position: 1 }, { id: 4, name: 'Autre', position: 4 },
    ] });
    expect(locations(batches, known).map((l) => [l.name, l.count])).toEqual([
      ['Frigo', 4], ['Congélateur', 0], ['Placard', 2], ['Autre', 0],
    ]);
  });
});

describe('aislesOf', () => {
  const batches = parseBatches(RAW);

  it('lists the non-empty aisles of a location by aisle position, "Sans rayon" last', () => {
    expect(aislesOf(batches, 1)).toEqual([
      { aisleId: 1, name: 'Fruits et légumes', count: 1 },
      { aisleId: 5, name: 'Crémerie', count: 2 },
      { aisleId: null, name: 'Sans rayon', count: 1 },
    ]);
    expect(aislesOf(batches, 3)).toEqual([{ aisleId: 8, name: 'Épicerie salée', count: 2 }]);
  });
});

describe('batchesOf', () => {
  const batches = parseBatches(RAW);

  it('sorts by best-before ascending, undated last, then product name', () => {
    expect(batchesOf(batches, { locationId: 1 }).map((b) => b.product))
      .toEqual(['Beurre', 'Carottes', 'Yaourt', 'Restes']);
  });

  it('filters on the aisle, null meaning the products without one', () => {
    expect(batchesOf(batches, { locationId: 1, aisleId: 5 }).map((b) => b.id)).toEqual([14, 11]);
    expect(batchesOf(batches, { locationId: 1, aisleId: null }).map((b) => b.id)).toEqual([13]);
  });

  it('filters on a set of ids, across locations', () => {
    expect(batchesOf(batches, { ids: new Set([22, 12]) }).map((b) => b.id)).toEqual([12, 22]);
  });
});

describe('page', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('shows up to six rows with nothing more', () => {
    expect(PAGE_ROWS).toBe(6);
    expect(page(items(6), 0)).toEqual({ rows: items(6), more: 0 });
  });

  it('turns the sixth row into "more" beyond six items', () => {
    expect(page(items(7), 0)).toEqual({ rows: [0, 1, 2, 3, 4], more: 2 });
    expect(page(items(7), 1)).toEqual({ rows: [5, 6], more: 0 });
  });

  it('chains pages of five while more than six remain', () => {
    expect(page(items(13), 1)).toEqual({ rows: [5, 6, 7, 8, 9], more: 3 });
    expect(page(items(13), 2)).toEqual({ rows: [10, 11, 12], more: 0 });
  });
});
