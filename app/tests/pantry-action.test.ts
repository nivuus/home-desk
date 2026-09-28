// The pantry loader, its navigation and the consume action (spec §1–§2): two-press arming, the
// exact `home_stock/stock/consume` payload, a reload after success, nothing removed on a refusal,
// the same idempotency key after a silence, nothing sent offline.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefusHA } from '../src/connexion';
import { createArming } from '../src/cochage';
import {
  newPantryState, loadPantry, openLocation, openAisle, openSoon, openBatch, nextPage, back,
  chooseFraction, stepQuantity, pressReason, injectStock, SILENCE_MESSAGE, type PantryHost,
} from '../src/boot/pantry';

const SOON = 'todo.stock_soon';

function row(o: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1, remaining: 350, best_before: null, product_id: 1, product_name: 'Produit', base_unit: 'g',
    location_id: 1, location_name: 'Frigo', location_position: 1,
    aisle_id: null, aisle_name: null, aisle_position: null, ...o,
  };
}

// Two batches in the fridge, in two aisles; one in the cupboard, in a single aisle.
const ROWS = [
  row({ id: 11, product_id: 1, product_name: 'Yaourt nature', aisle_id: 5, aisle_name: 'Crémerie', aisle_position: 5 }),
  row({ id: 12, product_id: 2, product_name: 'Abricots', remaining: 6, base_unit: 'piece',
        aisle_id: 1, aisle_name: 'Fruits et légumes', aisle_position: 1 }),
  row({ id: 21, product_id: 3, product_name: 'Pâtes', location_id: 3, location_name: 'Placard',
        location_position: 3, aisle_id: 8, aisle_name: 'Épicerie salée', aisle_position: 8 }),
];
const LOCATIONS = [{ id: 1, name: 'Frigo', position: 1 }, { id: 3, name: 'Placard', position: 3 }];

type Answer = unknown | Error;

function makeHost(answers: { batches?: Answer; locations?: Answer; consume?: Answer; soon?: Answer } = {}) {
  const timers: (() => void)[] = [];
  const minuteurFn = ((fn: () => void) => { timers.push(fn); return timers.length; }) as unknown as typeof setTimeout;
  const settle = (a: Answer) => (a instanceof Error ? Promise.reject(a) : Promise.resolve(a));
  const envoyerCommande = vi.fn((p: Record<string, unknown>) => {
    if (p.type === 'home_stock/batches/list') return settle(answers.batches ?? { batches: ROWS });
    if (p.type === 'home_stock/locations/list') return settle(answers.locations ?? { locations: LOCATIONS });
    if (p.type === 'home_stock/stock/consume') return settle(answers.consume ?? { movement_ids: [7] });
    return Promise.reject(new RefusHA('unknown_command', 'unknown'));
  });
  const listerTaches = vi.fn(() => settle(answers.soon ?? [{ uid: '12', texte: 'Abricots' }]) as
    Promise<{ uid: string; texte: string }[]>);
  const s: PantryHost = {
    cx: { envoyerCommande, listerTaches },
    horsLigne: false,
    pantry: newPantryState(SOON),
    armementStock: createArming(minuteurFn),
    d: { minuteurFn },
    dessiner: vi.fn(),
  };
  const consumeCalls = () => envoyerCommande.mock.calls.map((c) => c[0]).filter((p) => p.type === 'home_stock/stock/consume');
  const listCalls = () => envoyerCommande.mock.calls.filter((c) => c[0].type === 'home_stock/batches/list').length;
  return { s, envoyerCommande, listerTaches, timers, consumeCalls, listCalls };
}

async function loadedSheet(h: ReturnType<typeof makeHost>, id = 11) {
  await loadPantry(h.s);
  openBatch(h.s, h.s.pantry.batches.find((b) => b.id === id)!);
}

describe('loadPantry', () => {
  it('reads the batches, the locations and the soon list, and becomes ready', async () => {
    const h = makeHost();
    await loadPantry(h.s);
    expect(h.s.pantry.status).toBe('ready');
    expect(h.s.pantry.batches.map((b) => b.id)).toEqual([11, 12, 21]);
    expect(h.s.pantry.known.map((l) => l.name)).toEqual(['Frigo', 'Placard']);
    expect([...h.s.pantry.soonIds!]).toEqual([12]);
    expect(h.listerTaches).toHaveBeenCalledWith(SOON);
  });

  it('says "error" when the batches cannot be read', async () => {
    const h = makeHost({ batches: new RefusHA('unknown_command', 'Unknown command.') });
    await loadPantry(h.s);
    expect(h.s.pantry.status).toBe('error');
  });

  it('says "empty" when nothing is in stock', async () => {
    const h = makeHost({ batches: { batches: [] } });
    await loadPantry(h.s);
    expect(h.s.pantry.status).toBe('empty');
  });

  it('stays usable without the locations or the soon list', async () => {
    const h = makeHost({ locations: new Error('down'), soon: new Error('down') });
    await loadPantry(h.s);
    expect(h.s.pantry.status).toBe('ready');
    expect(h.s.pantry.known).toEqual([]);
    expect(h.s.pantry.soonIds).toBeNull();
  });

  it('an injected stock wins over a real read still in flight', async () => {
    const h = makeHost();
    const pending = loadPantry(h.s);
    injectStock(h.s, [row({ id: 90, product_name: 'Injecté' })], LOCATIONS, ['90']);
    await pending;
    expect(h.s.pantry.batches.map((b) => b.id)).toEqual([90]);
    expect([...h.s.pantry.soonIds!]).toEqual([90]);
  });

  it('ignores soon-list entries that are not batch ids', async () => {
    const h = makeHost({ soon: [{ uid: 'abc', texte: 'x' }, { uid: '21', texte: 'Pâtes' }] });
    await loadPantry(h.s);
    expect([...h.s.pantry.soonIds!]).toEqual([21]);
  });
});

describe('navigation', () => {
  let h: ReturnType<typeof makeHost>;
  beforeEach(async () => { h = makeHost(); await loadPantry(h.s); });

  it('opens the aisles of a location that has several', () => {
    openLocation(h.s, 1);
    expect(h.s.pantry.level).toBe('aisles');
    openAisle(h.s, 5);
    expect(h.s.pantry.level).toBe('batches');
    expect(h.s.pantry.aisleId).toBe(5);
    back(h.s);
    expect(h.s.pantry.level).toBe('aisles');
    back(h.s);
    expect(h.s.pantry.level).toBe('entry');
  });

  it('goes straight to the batches of a location with a single aisle, and back to the entry', () => {
    openLocation(h.s, 3);
    expect(h.s.pantry.level).toBe('batches');
    expect(h.s.pantry.aisleId).toBeUndefined();
    back(h.s);
    expect(h.s.pantry.level).toBe('entry');
  });

  it('skips the aisle level when home-stock sends no aisle', async () => {
    const old = ROWS.map(({ aisle_id: _a, aisle_name: _n, aisle_position: _p, ...r }) => r);
    const h2 = makeHost({ batches: { batches: old } });
    await loadPantry(h2.s);
    openLocation(h2.s, 1);
    expect(h2.s.pantry.level).toBe('batches');
  });

  it('opens the soon batches across locations', () => {
    openSoon(h.s);
    expect(h.s.pantry.level).toBe('batches');
    expect(h.s.pantry.soon).toBe(true);
    back(h.s);
    expect(h.s.pantry.level).toBe('entry');
  });

  it('turns pages, and Back turns them back first', async () => {
    const many = Array.from({ length: 8 }, (_, i) => row({ id: 100 + i, product_id: 100 + i,
      product_name: `Produit ${i}`, location_id: 3, location_name: 'Placard', location_position: 3 }));
    const h2 = makeHost({ batches: { batches: many } });
    await loadPantry(h2.s);
    openLocation(h2.s, 3);
    nextPage(h2.s);
    expect(h2.s.pantry.pageIndex).toBe(1);
    nextPage(h2.s);
    expect(h2.s.pantry.pageIndex).toBe(1);   // the last page has no "Suite"
    back(h2.s);
    expect(h2.s.pantry.pageIndex).toBe(0);
    expect(h2.s.pantry.level).toBe('batches');
  });

  it('opens the sheet with everything selected', () => {
    openBatch(h.s, h.s.pantry.batches[0]);
    expect(h.s.pantry.level).toBe('sheet');
    expect(h.s.pantry.quantity).toBe(350);
    chooseFraction(h.s, 'half');
    expect(h.s.pantry.quantity).toBe(175);
    stepQuantity(h.s, -1);
    expect(h.s.pantry.quantity).toBe(125);
  });
});

describe('pressReason', () => {
  it('arms on the first press and sends nothing', async () => {
    const h = makeHost();
    await loadedSheet(h);
    await pressReason(h.s, 'consumption');
    expect(h.consumeCalls()).toHaveLength(0);
    expect(h.s.armementStock.estArmee('consumption')).toBe(true);
  });

  it('arming another reason disarms the first', async () => {
    const h = makeHost();
    await loadedSheet(h);
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'discard');
    expect(h.s.armementStock.estArmee('consumption')).toBe(false);
    expect(h.s.armementStock.estArmee('discard')).toBe(true);
    expect(h.consumeCalls()).toHaveLength(0);
  });

  it('sends the exact command on the second press', async () => {
    const h = makeHost();
    await loadedSheet(h);
    chooseFraction(h.s, 'half');
    await pressReason(h.s, 'discard');
    const key = h.s.pantry.pendingKey;
    await pressReason(h.s, 'discard');
    expect(h.consumeCalls()).toEqual([{
      type: 'home_stock/stock/consume', product_id: 1, batch_id: 11, quantity: 175,
      reason: 'discard', idempotency_key: key,
    }]);
    expect(typeof key).toBe('string');
  });

  it('on success, goes back to the batches, reloads them and says what left', async () => {
    const h = makeHost();
    await loadedSheet(h);
    chooseFraction(h.s, 'half');
    const before = h.listCalls();
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    expect(h.s.pantry.level).toBe('batches');
    expect(h.listCalls()).toBe(before + 1);
    expect(h.s.pantry.banner).toBe('Mangé : 175 g de Yaourt nature');
    expect(h.s.pantry.pendingKey).toBeUndefined();
  });

  it('climbs out of a level the consumption emptied', async () => {
    const h = makeHost();
    await loadPantry(h.s);
    openSoon(h.s);
    openBatch(h.s, h.s.pantry.batches.find((b) => b.id === 12)!);
    h.envoyerCommande.mockImplementation((p: Record<string, unknown>) => Promise.resolve(
      p.type === 'home_stock/batches/list' ? { batches: ROWS.filter((r) => r.id !== 12) }
        : p.type === 'home_stock/locations/list' ? { locations: LOCATIONS } : { movement_ids: [7] }));
    h.listerTaches.mockImplementation(() => Promise.resolve([]));
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    expect(h.s.pantry.level).toBe('entry');
    expect(h.s.pantry.soon).toBeUndefined();
  });

  it('elides "de" before a vowel, and names the other reasons', async () => {
    const h = makeHost();
    await loadedSheet(h, 12);
    await pressReason(h.s, 'expired');
    await pressReason(h.s, 'expired');
    expect(h.s.pantry.banner).toBe('Périmé : 6 pièces d’Abricots');
    h.timers.forEach((t) => t());
    expect(h.s.pantry.banner).toBeUndefined();
  });

  it('on a refusal, keeps the sheet open with home-stock’s message and removes nothing', async () => {
    const h = makeHost({ consume: new RefusHA('insufficient_stock', 'Il ne reste que 100 g.') });
    await loadedSheet(h);
    const batches = h.s.pantry.batches;
    const before = h.listCalls();
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    expect(h.s.pantry.level).toBe('sheet');
    expect(h.s.pantry.message).toBe('Il ne reste que 100 g.');
    expect(h.s.pantry.batches).toBe(batches);
    expect(h.s.pantry.batches.map((b) => b.id)).toEqual([11, 12, 21]);
    expect(h.listCalls()).toBe(before);
  });

  it('on a silence, warns that nothing left and retries with the same key', async () => {
    const h = makeHost({ consume: new RefusHA('delai_depasse', 'Home Assistant n’a pas répondu en 15 s') });
    await loadedSheet(h);
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    expect(h.s.pantry.level).toBe('sheet');
    expect(h.s.pantry.message).toBe(SILENCE_MESSAGE);
    const key = h.s.pantry.pendingKey;
    expect(key).toBeDefined();
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    const calls = h.consumeCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1].idempotency_key).toBe(calls[0].idempotency_key);
  });

  it('treats a dead connection like a silence', async () => {
    const h = makeHost({ consume: new Error('websocket indisponible') });
    await loadedSheet(h);
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    expect(h.s.pantry.message).toBe(SILENCE_MESSAGE);
  });

  it('sends nothing and arms nothing offline', async () => {
    const h = makeHost();
    await loadedSheet(h);
    h.s.horsLigne = true;
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    expect(h.consumeCalls()).toHaveLength(0);
    expect(h.s.armementStock.estArmee('consumption')).toBe(false);
  });

  it('Back from the sheet forgets the key, the message and the arming', async () => {
    const h = makeHost({ consume: new RefusHA('delai_depasse', 'x') });
    await loadedSheet(h);
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    back(h.s);
    expect(h.s.pantry.level).not.toBe('sheet');
    expect(h.s.pantry.pendingKey).toBeUndefined();
    expect(h.s.pantry.message).toBeUndefined();
    expect(h.s.armementStock.estArmee('consumption')).toBe(false);
  });
});

// Final review of the branch (2026-09-28): a consumption must never be counted twice, a late
// answer must never rewrite the screen the user has moved to, and a failed read is said, not
// shown as zero.
describe('after a silence (review C1, I3)', () => {
  async function silenced() {
    const h = makeHost({ consume: new RefusHA('delai_depasse', 'x') });
    await loadedSheet(h);
    chooseFraction(h.s, 'half');
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    return h;
  }

  it('Back then reopening the same batch retries with the same key, quantity and reason', async () => {
    const h = await silenced();
    back(h.s);
    openBatch(h.s, h.s.pantry.batches.find((b) => b.id === 11)!);
    expect(h.s.pantry.quantity).toBe(175);
    expect(h.s.pantry.message).toBe(SILENCE_MESSAGE);
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    const calls = h.consumeCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('Back from a sheet with a message reloads the list', async () => {
    const h = await silenced();
    const before = h.listCalls();
    back(h.s);
    await vi.waitFor(() => expect(h.listCalls()).toBe(before + 1));
  });

  it('locks the quantity and the other reasons until the retry is answered', async () => {
    const h = await silenced();
    chooseFraction(h.s, 'quarter');
    stepQuantity(h.s, 1);
    expect(h.s.pantry.quantity).toBe(175);
    await pressReason(h.s, 'discard');
    await pressReason(h.s, 'discard');
    expect(h.consumeCalls()).toHaveLength(1);
    expect(h.s.armementStock.estArmee('discard')).toBe(false);
  });

  it('a success releases the lock for that batch', async () => {
    const h = await silenced();
    h.envoyerCommande.mockImplementation((p: Record<string, unknown>) => Promise.resolve(
      p.type === 'home_stock/batches/list' ? { batches: ROWS }
        : p.type === 'home_stock/locations/list' ? { locations: LOCATIONS } : { movement_ids: [7] }));
    await pressReason(h.s, 'consumption');
    await pressReason(h.s, 'consumption');
    openBatch(h.s, h.s.pantry.batches.find((b) => b.id === 11)!);
    expect(h.s.pantry.message).toBeUndefined();
    expect(h.s.pantry.quantity).toBe(350);
  });

  it('a change of quantity disarms the armed reason', async () => {
    const h = makeHost();
    await loadedSheet(h);
    await pressReason(h.s, 'consumption');
    chooseFraction(h.s, 'half');
    expect(h.s.armementStock.estArmee('consumption')).toBe(false);
  });
});

describe('a late answer (review I1)', () => {
  function deferred() {
    let resolve!: (v: unknown) => void; let reject!: (e: unknown) => void;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it('a success arriving after the user left the sheet does not move the screen', async () => {
    const h = makeHost();
    await loadedSheet(h);
    const d = deferred();
    const base = h.envoyerCommande.getMockImplementation()!;
    h.envoyerCommande.mockImplementation((p: Record<string, unknown>) =>
      p.type === 'home_stock/stock/consume' ? d.promise : base(p));
    await pressReason(h.s, 'consumption');
    const sending = pressReason(h.s, 'consumption');
    back(h.s); back(h.s);   // sheet -> batches -> entry
    expect(h.s.pantry.level).toBe('entry');
    d.resolve({ movement_ids: [7] });
    await sending;
    expect(h.s.pantry.level).toBe('entry');
    expect(h.s.pantry.banner).toBe('Mangé : 350 g de Yaourt nature');
  });

  it('a failure arriving on another batch’s sheet leaves that sheet alone', async () => {
    const h = makeHost();
    await loadedSheet(h);
    const d = deferred();
    const base = h.envoyerCommande.getMockImplementation()!;
    h.envoyerCommande.mockImplementation((p: Record<string, unknown>) =>
      p.type === 'home_stock/stock/consume' ? d.promise : base(p));
    await pressReason(h.s, 'consumption');
    const sending = pressReason(h.s, 'consumption');
    back(h.s);
    openBatch(h.s, h.s.pantry.batches.find((b) => b.id === 12)!);
    d.reject(new RefusHA('insufficient_stock', 'Il ne reste que 100 g.'));
    await sending;
    expect(h.s.pantry.selected?.id).toBe(12);
    expect(h.s.pantry.message).toBeUndefined();
  });
});

describe('pages of the aisles (review I2)', () => {
  it('Back from the second page of aisles returns to the first, then to the entry', async () => {
    const many = Array.from({ length: 8 }, (_, i) => row({
      id: 200 + i, product_id: 200 + i, product_name: `P${i}`,
      aisle_id: 30 + i, aisle_name: `Rayon ${i}`, aisle_position: i,
    }));
    const h = makeHost({ batches: { batches: many } });
    await loadPantry(h.s);
    openLocation(h.s, 1);
    expect(h.s.pantry.level).toBe('aisles');
    nextPage(h.s);
    expect(h.s.pantry.pageIndex).toBe(1);
    back(h.s);
    expect(h.s.pantry.level).toBe('aisles');
    expect(h.s.pantry.pageIndex).toBe(0);
    back(h.s);
    expect(h.s.pantry.level).toBe('entry');
    expect(h.s.pantry.pageIndex).toBe(0);
  });

  it('pages the aisles by their own count, not by the number of batches', async () => {
    const rows = [...Array.from({ length: 7 }, (_, i) => row({
      id: 300 + i, product_id: 300 + i, product_name: `A${i}`,
      aisle_id: 5, aisle_name: 'Crémerie', aisle_position: 5,
    })), row({ id: 399, product_id: 399, product_name: 'B', aisle_id: 1, aisle_name: 'Fruits', aisle_position: 1 })];
    const h = makeHost({ batches: { batches: rows } });
    await loadPantry(h.s);
    openLocation(h.s, 1);
    nextPage(h.s);   // two aisles: a single page
    expect(h.s.pantry.pageIndex).toBe(0);
  });
});

describe('the soon list (review I4)', () => {
  it('a failed read of the soon list is known, never read as zero', async () => {
    const h = makeHost({ soon: new Error('down') });
    await loadPantry(h.s);
    expect(h.s.pantry.soonIds).toBeNull();
  });
});
