// @vitest-environment jsdom
//
// Production gate of step 5, 2026-09-28, defect A: the kitchen showed "Recette / Garde-manger
// non installé" while `home_stock` WAS installed and loaded. `sensor.home_stock_next_meal` was
// `unknown` because no meal was planned, and every `absenceNommee` passage point asked
// `Etat.estUtilisable`, which puts `unknown` (the entity exists, it has nothing to say) in the
// same bag as `unavailable` or missing (the integration is not there). A false diagnosis is the
// "dead button in prose" this project forbids: it sends the owner to install what is installed.
//
// The rule these tests pin: an absence is NAMED only when the entity is really absent —
// missing from Home Assistant, or `unavailable`. `unknown` is a present entity without a value.
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'lit';
import { Etat } from '../src/etat';
import { ECRANS, type Bouton, type EntreeSynthese } from '../src/ecran';
import { rendreCorps, ligneSynthese } from '../src/rendu/corps';
import { etiquette } from '../src/rendu/tile';
import { rendreMaison } from '../src/rendu/maison';
import { createPress } from '../src/interaction';

const ABSENT = 'Garde-manger non installé';
const MEAL = 'sensor.home_stock_next_meal';
const SHOPPING = 'todo.home_stock_shopping';

const RECIPE: Bouton = { libelle: 'Recette', icone: 'book', entite: MEAL, vue: '#recette',
                         absenceNommee: ABSENT };
const SHOPPING_TILE: Bouton = { libelle: 'Courses', icone: 'list', entite: SHOPPING,
                                vue: '#taches', absenceNommee: ABSENT };
const SCANNER: Bouton = { libelle: 'Scanner', icone: 'scan', entite: MEAL, lien: '/home-stock',
                          absenceNommee: ABSENT };

const withState = (id: string, state: string) => {
  const etat = new Etat();
  etat.appliquer({ entity_id: id, state, attributes: {} });
  return etat;
};
const room = (commandes: Bouton[]) =>
  ({ ...ECRANS.cuisine, ambiances: [], commandes, synthese: [], extrasMaison: [] });
function body(etat: Etat, commandes: Bouton[], recipeOpenable = false): HTMLElement {
  const div = document.createElement('div');
  render(rendreCorps(etat, room(commandes), undefined, undefined, undefined, false,
                     recipeOpenable), div);
  return div;
}
function house(etat: Etat): HTMLElement {
  const div = document.createElement('div');
  render(rendreMaison(etat, { ...ECRANS.cuisine, extrasMaison: [SCANNER] }), div);
  return div;
}

describe('Etat.isPresent — does Home Assistant know the entity right now?', () => {
  it('is false for a missing entity and for `unavailable`, true for `unknown` and a value', () => {
    expect(new Etat().isPresent(MEAL)).toBe(false);
    expect(withState(MEAL, 'unavailable').isPresent(MEAL)).toBe(false);
    expect(withState(MEAL, 'unknown').isPresent(MEAL)).toBe(true);
    expect(withState(MEAL, 'Gratin').isPresent(MEAL)).toBe(true);
  });
});

describe('absenceNommee on a present entity with nothing to say (`unknown`)', () => {
  afterEach(() => { location.hash = ''; });

  it('Recette: no meal planned hides the tile, exactly as a meal without a recipe does', () => {
    const div = body(withState(MEAL, 'unknown'), [RECIPE]);
    expect(div.querySelectorAll('.commande')).toHaveLength(0);
    expect(div.textContent).not.toContain(ABSENT);
  });

  it('Recette: the absence is still named when the sensor is `unavailable`', () => {
    const div = body(withState(MEAL, 'unavailable'), [RECIPE]);
    expect(div.querySelectorAll('.commande.absent')).toHaveLength(1);
    expect(div.querySelector('.commande .s')!.textContent).toBe(ABSENT);
  });

  it('Courses: a present list keeps a live tile, without the absence label nor a raw state', () => {
    const etat = withState(SHOPPING, 'unknown');
    expect(etiquette(etat, SHOPPING_TILE)).toBe('');
    const div = body(etat, [SHOPPING_TILE]);
    const tile = div.querySelector('.commande')!;
    expect(tile.className).not.toMatch(/\babsent\b|\binerte\b/);
    expect(tile.textContent).not.toContain(ABSENT);
    expect(tile.textContent).not.toContain('unknown');
  });

  it('Courses: pressing it still opens the tasks view (never a dead button)', () => {
    const etat = withState(SHOPPING, 'unknown');
    createPress(etat, { appelerService: () => {} }, setTimeout)(etat, SHOPPING_TILE);
    expect(location.hash).toBe('#taches');
  });

  it('Courses: pressing it stays inert while the list is really absent', () => {
    const etat = withState(SHOPPING, 'unavailable');
    createPress(etat, { appelerService: () => {} }, setTimeout)(etat, SHOPPING_TILE);
    expect(location.hash).toBe('');
  });

  it('Scanner: the pantry panel stays reachable when no meal is planned', () => {
    const tile = Array.from(house(withState(MEAL, 'unknown')).querySelectorAll('.tuile'))
      .find((t) => t.textContent?.includes('Scanner'))!;
    expect(tile).toBeDefined();
    expect(tile.className).not.toMatch(/\babsent\b/);
    expect(tile.textContent).not.toContain(ABSENT);
  });

  it('Scanner: the absence is still named when the sensor is missing', () => {
    const tile = Array.from(house(new Etat()).querySelectorAll('.tuile'))
      .find((t) => t.textContent?.includes('Scanner'))!;
    expect(tile.className).toMatch(/\babsent\b/);
    expect(tile.textContent).toContain(ABSENT);
  });

  it('summary line: a present entity without a value is skipped, not called absent', () => {
    const entry = { entite: MEAL, texte: '{etat}', operateur: '!=', valeur: '',
                    absenceNommee: ABSENT } as EntreeSynthese;
    expect(ligneSynthese(withState(MEAL, 'unknown'), [entry]).ecarts).toEqual([]);
    expect(ligneSynthese(withState(MEAL, 'unavailable'), [entry]).ecarts).toEqual([ABSENT]);
  });
});
