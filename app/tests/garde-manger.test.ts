/** Le garde-manger lu dans des attributs d'entités — la source qui remplace le client HTTP.
 *
 *  Tout est PUR ici : aucun réseau, aucune horloge lue, `Etat` construit à la main. C'est la
 *  même discipline que `contexte.test.ts`, `jauge.test.ts` et `modes.test.ts`. */
import { describe, it, expect } from 'vitest';
import { Etat } from '../src/etat';
import { repasSuivant, nombreDlc } from '../src/garde-manger';

const LE_21_A_18H = new Date(2026, 7, 21, 18, 0);

function etatAvec(id: string, etat: string, attributs: Record<string, unknown>): Etat {
  const e = new Etat();
  e.appliquer({ entity_id: id, state: etat, attributes: attributs });
  return e;
}

function etatIndisponible(id: string): Etat {
  return etatAvec(id, 'unavailable', {});
}

describe('repasSuivant', () => {
  it("lit le plat dans l'ÉTAT et le reste dans les attributs", () => {
    const etat = etatAvec('sensor.home_stock_next_meal', 'Gratin dauphinois', {
      day: '2026-08-21', slot: 'dinner', recipe_id: 12, meal_id: 42,
      missing_ingredients: 0,
    });
    expect(repasSuivant(etat, LE_21_A_18H)).toEqual({
      etiquette: 'Dîner', plat: 'Gratin dauphinois',
      mealId: 42, recetteId: 12, manquants: 0,
    });
  });

  it('rend undefined quand le capteur est indisponible', () => {
    // `Etat.estUtilisable` est le SEUL mécanisme de masquage : le lot ne réintroduit pas de règle
    // propre au garde-manger. Composant non chargé, base verrouillée, HA qui redémarre — même
    // comportement, une seule fois.
    expect(repasSuivant(etatIndisponible('sensor.home_stock_next_meal'), LE_21_A_18H))
      .toBeUndefined();
  });

  it("rend undefined quand aucun repas n'est prévu", () => {
    // Un plan de repas vide est l'état ORDINAIRE de cette installation. `home_stock` ne le
    // remplira pas par magie : le bloc doit disparaître, et `rendreEntretien` prendre sa place.
    expect(repasSuivant(etatAvec('sensor.home_stock_next_meal', '', {
      day: null, slot: null, recipe_id: null, meal_id: null,
      missing_ingredients: 0,
    }), LE_21_A_18H)).toBeUndefined();
  });

  it("étiquette « Demain, déjeuner » quand le jour n'est pas aujourd'hui", () => {
    // C'est TOUT ce qui survit de `src/repas.ts` : le choix de l'étiquette reste une décision
    // d'affichage. Le parcours du plan, lui, est mort.
    const r = repasSuivant(etatAvec('sensor.home_stock_next_meal', 'Soupe', {
      day: '2026-08-22', slot: 'lunch', recipe_id: null, meal_id: 7, missing_ingredients: 0,
    }), LE_21_A_18H);
    expect(r!.etiquette).toBe('Demain, déjeuner');
  });

  it("nomme le jour de la semaine au-delà de demain", () => {
    // « Demain » pour un repas de lundi serait un mensonge affiché en grand dans la cuisine —
    // exactement ce que ce projet traque. Le 24 août 2026 est un lundi.
    const r = repasSuivant(etatAvec('sensor.home_stock_next_meal', 'Chili', {
      day: '2026-08-24', slot: 'dinner', recipe_id: null, meal_id: 8, missing_ingredients: 0,
    }), LE_21_A_18H);
    expect(r!.etiquette).toBe('Lundi, dîner');
  });

  it('étiquette chaque créneau en français', () => {
    for (const [slot, attendu] of [['breakfast', 'Petit-déjeuner'], ['lunch', 'Déjeuner'],
                                   ['dinner', 'Dîner'], ['snack', 'Collation']] as const) {
      const r = repasSuivant(etatAvec('sensor.home_stock_next_meal', 'X', {
        day: '2026-08-21', slot, recipe_id: null, meal_id: 1, missing_ingredients: 0,
      }), LE_21_A_18H);
      expect(r!.etiquette).toContain(attendu);
    }
  });

  it('reporte le nombre d\'ingrédients manquants', () => {
    const r = repasSuivant(etatAvec('sensor.home_stock_next_meal', 'Curry', {
      day: '2026-08-21', slot: 'dinner', recipe_id: 3, meal_id: 9, missing_ingredients: 2,
    }), LE_21_A_18H);
    expect(r!.manquants).toBe(2);
  });

  it('survit à un attribut absent sans lever', () => {
    // Un composant plus ancien que le bundle ne publie pas `meal_id`. L'écran doit vivre : le
    // bloc s'affiche, il n'est simplement pas validable.
    const r = repasSuivant(etatAvec('sensor.home_stock_next_meal', 'Soupe', { slot: 'dinner' }),
                           LE_21_A_18H);
    expect(r!.mealId).toBeNull();
    expect(r!.recetteId).toBeNull();
    expect(r!.manquants).toBe(0);
  });

  it("ne lève sur AUCUNE forme d'attribut", () => {
    for (const attributs of [{}, { slot: 42 }, { meal_id: 'douze' }, { day: [] }] as Record<string, unknown>[]) {
      expect(() => repasSuivant(etatAvec('sensor.home_stock_next_meal', 'X', attributs),
                                LE_21_A_18H)).not.toThrow();
    }
  });

  it("étiquette « Repas » quand le créneau est illisible", () => {
    const r = repasSuivant(etatAvec('sensor.home_stock_next_meal', 'X', { slot: 42 }), LE_21_A_18H);
    expect(r!.etiquette).toBe('Repas');
  });
});

describe('nombreDlc', () => {
  it("lit le compte dans l'état de la liste todo", () => {
    // L'état d'une entité `todo` est le nombre d'éléments non cochés — la propriété que
    // `tests/test_entities.py` tient désormais côté composant. Un `binary_sensor` ne pourrait
    // produire qu'un texte sans compte, or le compte est ce qu'on lit de loin.
    expect(nombreDlc(etatAvec('todo.home_stock_expirations', '3', {}))).toBe(3);
  });

  it('rend 0 quand plus rien ne périme', () => {
    expect(nombreDlc(etatAvec('todo.home_stock_expirations', '0', {}))).toBe(0);
  });

  it('rend undefined sur une entité indisponible ou un état illisible', () => {
    // undefined ≠ 0 : zéro fait DISPARAÎTRE la ligne (rien ne périme), undefined la masque aussi
    // mais pour une autre raison. Les confondre n'a pas d'effet visible ici — et c'est justement
    // pourquoi il faut le tester : le jour où la ligne dira « aucun produit à consommer », la
    // différence deviendra visible d'un coup.
    expect(nombreDlc(etatIndisponible('todo.home_stock_expirations'))).toBeUndefined();
    expect(nombreDlc(etatAvec('todo.home_stock_expirations', 'unknown', {}))).toBeUndefined();
    expect(nombreDlc(etatAvec('todo.home_stock_expirations', 'trois', {}))).toBeUndefined();
    expect(nombreDlc(new Etat())).toBeUndefined();
  });
});
