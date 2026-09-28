// @vitest-environment jsdom
//
// The pantry views (spec §1–§2): entry, aisles, batches, sheet, and the status screens. Real render
// through `lit` + DOM; the height budget is checked arithmetically (jsdom computes no layout), like
// tests/taches.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPantry, wirePantry, SHEET_ROWS, type PantryView } from '../src/rendu/pantry-lists';
import { newPantryState, type PantryState } from '../src/boot/pantry';
import { parseBatches, parseLocations, PAGE_ROWS } from '../src/pantry/model';

function row(o: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1, remaining: 350, best_before: null, product_id: 1, product_name: 'Produit', base_unit: 'g',
    location_id: 1, location_name: 'Frigo', location_position: 1,
    aisle_id: null, aisle_name: null, aisle_position: null, ...o,
  };
}

// Two locations (plus two empty ones), two aisles in the fridge.
const ROWS = [
  row({ id: 11, product_id: 1, product_name: 'Yaourt nature', best_before: '2026-10-05',
        aisle_id: 5, aisle_name: 'Crémerie', aisle_position: 5 }),
  row({ id: 12, product_id: 2, product_name: 'Abricots', remaining: 6, base_unit: 'piece',
        best_before: '2026-09-20', aisle_id: 1, aisle_name: 'Fruits et légumes', aisle_position: 1 }),
  row({ id: 13, product_id: 4, product_name: 'Crème', best_before: null,
        aisle_id: 5, aisle_name: 'Crémerie', aisle_position: 5 }),
  row({ id: 21, product_id: 3, product_name: 'Pâtes', location_id: 3, location_name: 'Placard',
        location_position: 3, aisle_id: 8, aisle_name: 'Épicerie salée', aisle_position: 8 }),
];
const LOCATIONS = [
  { id: 1, name: 'Frigo', position: 1 }, { id: 2, name: 'Congélateur', position: 2 },
  { id: 3, name: 'Placard', position: 3 }, { id: 4, name: 'Autre', position: 4 },
];

function ready(over: Partial<PantryState> = {}): PantryState {
  return {
    ...newPantryState('todo.x'), status: 'ready', batches: parseBatches(ROWS),
    known: parseLocations(LOCATIONS), soonIds: new Set([11]), ...over,
  };
}

function view(state: PantryState, over: Partial<PantryView> = {}): PantryView {
  return { state, horsLigne: false, today: '2026-09-28', armed: () => false, ...over };
}

function paint(v: PantryView): HTMLElement {
  const div = document.createElement('div');
  render(renderPantry(v), div);
  return div;
}

const titles = (div: HTMLElement) =>
  [...div.querySelectorAll('.ligne-tache .t')].map((e) => e.textContent?.trim());

const actions = {
  openSoon: vi.fn(), openLocation: vi.fn(), openAisle: vi.fn(), openBatch: vi.fn(),
  nextPage: vi.fn(), back: vi.fn(), retry: vi.fn(), chooseFraction: vi.fn(), step: vi.fn(),
  press: vi.fn(),
};
beforeEach(() => { Object.values(actions).forEach((f) => f.mockReset()); wirePantry(actions); });

describe('entry', () => {
  it('shows "À consommer vite (N)" then every location in position order', () => {
    const div = paint(view(ready()));
    expect(div.querySelector('[data-mvt="vue:garde-manger"]')).not.toBeNull();
    expect(titles(div)).toEqual(['À consommer vite (1)', 'Frigo', 'Congélateur', 'Placard', 'Autre']);
  });

  it('greys an empty location out and makes it inert', () => {
    const div = paint(view(ready()));
    const rows = [...div.querySelectorAll('.ligne-tache')];
    expect(rows[2].classList.contains('inactif')).toBe(true);
    rows[2].dispatchEvent(new Event('pointerdown'));
    expect(actions.openLocation).not.toHaveBeenCalled();
    rows[1].dispatchEvent(new Event('pointerdown'));
    expect(actions.openLocation).toHaveBeenCalledWith(1);
    rows[0].dispatchEvent(new Event('pointerdown'));
    expect(actions.openSoon).toHaveBeenCalled();
  });

  it('has a Back button', () => {
    const div = paint(view(ready()));
    div.querySelector('.xl')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.back).toHaveBeenCalled();
  });
});

describe('aisles', () => {
  it('lists the aisles of the location with their counts, and opens one', () => {
    const div = paint(view(ready({ level: 'aisles', locationId: 1 })));
    expect(titles(div)).toEqual(['Fruits et légumes', 'Crémerie']);
    expect(div.querySelector('.etiquette')?.textContent).toContain('Frigo');
    div.querySelectorAll('.ligne-tache')[1].dispatchEvent(new Event('pointerdown'));
    expect(actions.openAisle).toHaveBeenCalledWith(5);
  });
});

describe('batches', () => {
  it('shows product, remaining quantity and date, by date', () => {
    const div = paint(view(ready({ level: 'batches', locationId: 1 })));
    expect(titles(div)).toEqual(['Abricots', 'Yaourt nature', 'Crème']);
    const subs = [...div.querySelectorAll('.ligne-tache .s')].map((e) => e.textContent?.trim());
    expect(subs[0]).toContain('6 pièces');
    expect(subs[0]).toContain('20 sept.');
    expect(subs[2]).toBe('350 g');   // no date: nothing, never "Invalid Date"
  });

  it('colours a past date as expired and a soon batch as soon', () => {
    const div = paint(view(ready({ level: 'batches', locationId: 1 })));
    const rows = div.querySelectorAll('.ligne-tache');
    expect(rows[0].querySelector('.perime')).not.toBeNull();
    expect(rows[1].querySelector('.bientot')).not.toBeNull();
    expect(rows[2].querySelector('.perime, .bientot')).toBeNull();
  });

  it('turns the sixth row into "Suite › (N)" beyond six batches', () => {
    const many = Array.from({ length: 8 }, (_, i) => row({ id: 100 + i, product_id: 100 + i, product_name: `P${i}` }));
    const div = paint(view(ready({ batches: parseBatches(many), level: 'batches', locationId: 1 })));
    const rows = div.querySelectorAll('.ligne-tache');
    expect(rows).toHaveLength(PAGE_ROWS);
    expect(rows[5].textContent).toContain('Suite › (3)');
    rows[5].dispatchEvent(new Event('pointerdown'));
    expect(actions.nextPage).toHaveBeenCalled();
  });

  it('opens a batch on press', () => {
    const div = paint(view(ready({ level: 'batches', locationId: 1 })));
    div.querySelectorAll('.ligne-tache')[1].dispatchEvent(new Event('pointerdown'));
    expect(actions.openBatch.mock.calls[0][0].id).toBe(11);
  });

  it('shows the banner of the last consumption in place of the label', () => {
    const div = paint(view(ready({ level: 'batches', locationId: 1, banner: 'Mangé : 175 g de Yaourt nature' })));
    expect(div.querySelector('.etiquette')?.textContent).toContain('Mangé : 175 g de Yaourt nature');
  });
});

describe('sheet', () => {
  const sheet = (over: Partial<PantryState> = {}, v: Partial<PantryView> = {}) => {
    const s = ready();
    const selected = s.batches.find((b) => b.id === 11)!;
    return paint(view({ ...s, level: 'sheet', selected, quantity: 175, ...over }, v));
  };

  it('says what will leave and what will remain', () => {
    const div = sheet();
    expect(div.textContent).toContain('Yaourt nature');
    expect(div.textContent).toContain('Frigo');
    expect(div.textContent).toContain('Crémerie');
    expect(div.querySelector('.pantry-live')?.textContent?.trim()).toBe('Sortir 175 g · il restera 175 g');
  });

  it('offers Tout, ½ and ¼, then − and +', () => {
    const div = sheet();
    const fr = [...div.querySelectorAll('.pantry-fraction')];
    expect(fr.map((e) => e.textContent?.trim())).toEqual(['Tout', '½', '¼']);
    expect(fr[1].classList.contains('choisie')).toBe(true);   // 175 is half of 350
    fr[2].dispatchEvent(new Event('pointerdown'));
    expect(actions.chooseFraction).toHaveBeenCalledWith('quarter');
    div.querySelector('.pantry-moins')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.step).toHaveBeenCalledWith(-1);
    div.querySelector('.pantry-plus')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.step).toHaveBeenCalledWith(1);
  });

  it('offers Mangé first, then Jeté and Périmé', () => {
    const div = sheet();
    const reasons = [...div.querySelectorAll('.pantry-reason')];
    expect(reasons.map((e) => e.textContent?.trim())).toEqual(['Mangé', 'Jeté', 'Périmé']);
    expect(reasons[0].classList.contains('principal')).toBe(true);
    reasons[1].dispatchEvent(new Event('pointerdown'));
    expect(actions.press).toHaveBeenCalledWith('discard');
  });

  it('shows the armed button and says to touch again', () => {
    const div = sheet({}, { armed: (r) => r === 'consumption' });
    const armed = div.querySelector('.pantry-reason.armee');
    expect(armed?.textContent).toContain('Toucher pour confirmer');
    expect(div.querySelectorAll('.pantry-reason.armee')).toHaveLength(1);
  });

  it('disables the three reasons offline', () => {
    const div = sheet({}, { horsLigne: true });
    const reasons = [...div.querySelectorAll('.pantry-reason')];
    expect(reasons.every((e) => e.classList.contains('inactif'))).toBe(true);
    reasons[0].dispatchEvent(new Event('pointerdown'));
    expect(actions.press).not.toHaveBeenCalled();
  });

  it('shows home-stock’s message', () => {
    const div = sheet({ message: 'Il ne reste que 100 g.' });
    expect(div.querySelector('.etiquette')?.textContent).toContain('Il ne reste que 100 g.');
  });
});

describe('status screens', () => {
  it('never leaves the screen blank while loading', () => {
    const div = paint(view({ ...newPantryState('todo.x'), status: 'loading' }));
    expect(div.textContent).toContain('Chargement');
  });

  it('says "Garde-manger indisponible" with a Réessayer button', () => {
    const div = paint(view({ ...newPantryState('todo.x'), status: 'error' }));
    expect(div.textContent).toContain('Garde-manger indisponible');
    const retry = [...div.querySelectorAll('.ligne-tache')].find((e) => e.textContent?.includes('Réessayer'));
    retry!.dispatchEvent(new Event('pointerdown'));
    expect(actions.retry).toHaveBeenCalled();
  });

  it('says "Rien en stock" when empty', () => {
    const div = paint(view({ ...newPantryState('todo.x'), status: 'empty' }));
    expect(div.textContent).toContain('Rien en stock');
    expect(div.querySelector('.xl')).not.toBeNull();
  });
});

// Height budget: 585 px, zero margin, no scrolling. Same composition as tests/taches.test.ts:
// .corps padding (24) + 2 gaps (16) + label (~10) + Back button (62) = 112 px around the rows.
describe('height budget of the pantry views', () => {
  const ECRAN_PX = 585;
  const LIGNE_PX = 64;
  const GAP_PX = 8;
  const HORS_LISTE_PX = 112;
  const hauteur = (rangees: number) => HORS_LISTE_PX + rangees * LIGNE_PX + (rangees - 1) * GAP_PX;

  it(`a list level (${PAGE_ROWS} rows) fits in 585 px`, () => {
    expect(hauteur(PAGE_ROWS)).toBeLessThanOrEqual(ECRAN_PX);
    expect(hauteur(PAGE_ROWS + 1)).toBeGreaterThan(ECRAN_PX);
  });

  it(`the sheet (${SHEET_ROWS} rows of 64 px) fits in 585 px`, () => {
    expect(hauteur(SHEET_ROWS)).toBeLessThanOrEqual(ECRAN_PX);
  });

  it('a real list of 50 batches never renders more than the page', () => {
    const many = Array.from({ length: 50 }, (_, i) => row({ id: 100 + i, product_id: 100 + i, product_name: `P${i}` }));
    const div = paint(view(ready({ batches: parseBatches(many), level: 'batches', locationId: 1 })));
    expect(div.querySelectorAll('.ligne-tache').length).toBeLessThanOrEqual(PAGE_ROWS);
  });

  it('the sheet renders exactly its rows of 64 px', () => {
    const s = ready();
    const div = paint(view({ ...s, level: 'sheet', selected: s.batches[0], quantity: 350 }));
    expect(div.querySelectorAll('.pantry-rangee')).toHaveLength(SHEET_ROWS);
  });
});

// The arithmetic above holds only if the stylesheet gives the sheet rows the same 64 px as a list
// row; and the project rule forbids lowering the opacity of readable text.
describe('pantry stylesheet', () => {
  const css = () => readFileSync(join(process.cwd(), 'src/styles/pantry.css'), 'utf8');

  it('gives every sheet row 64 px', () => {
    const rule = css().match(/\n\.pantry-rangee \{([^}]*)\}/);
    expect(rule, '.pantry-rangee missing from pantry.css').not.toBeNull();
    expect(rule![1]).toMatch(/height:\s*64px;/);
  });

  it('greys an inert row without lowering its text opacity', () => {
    const rule = css().match(/\n\.ligne-tache\.inactif \{([^}]*)\}/);
    expect(rule, '.ligne-tache.inactif missing from pantry.css').not.toBeNull();
    expect(rule![1]).not.toMatch(/opacity/);
  });

  it('is bundled by the app entry point', () => {
    const entry = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');
    expect(entry).toMatch(/import '\.\/styles\/pantry\.css';/);
  });
});
