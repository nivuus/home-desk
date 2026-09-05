/** `src/repas.ts` après le lot 6 : plus que l'étiquette.
 *
 *  Le parcours du plan de repas (`candidatsRepas`, `resoudreRepasSuivant` et ses trois issues) est
 *  mort avec l'ancienne source — `home_stock` résout le repas suivant côté composant et le
 *  publie. */
import { describe, expect, it } from 'vitest';
import * as repas from '../src/repas';
import { etiquetteRepas } from '../src/repas';

const LE_21_A_18H = new Date(2026, 7, 21, 18, 0);

describe('src/repas.ts', () => {
  it("n'exporte plus resoudreRepasSuivant ni candidatsRepas", () => {
    // Ces deux fonctions parcouraient un plan de repas tiers. Les laisser vivre à côté de
    // `sensor.home_stock_next_meal` donnerait deux façons de répondre à la même question.
    expect(Object.keys(repas)).toEqual(['etiquetteRepas']);
  });
});

describe('etiquetteRepas', () => {
  it("nomme le créneau du jour, sans préfixe", () => {
    expect(etiquetteRepas('2026-08-21', 'dinner', LE_21_A_18H)).toBe('Dîner');
  });

  it('préfixe « Demain » le lendemain', () => {
    expect(etiquetteRepas('2026-08-22', 'lunch', LE_21_A_18H)).toBe('Demain, déjeuner');
  });

  it('nomme le jour de la semaine au-delà de demain', () => {
    // Le 24 août 2026 est un lundi. « Demain » y serait un mensonge affiché en grand.
    expect(etiquetteRepas('2026-08-24', 'dinner', LE_21_A_18H)).toBe('Lundi, dîner');
  });

  it('traduit les quatre créneaux', () => {
    for (const [creneau, attendu] of [['breakfast', 'Petit-déjeuner'], ['lunch', 'Déjeuner'],
                                      ['dinner', 'Dîner'], ['snack', 'Collation']] as const) {
      expect(etiquetteRepas('2026-08-21', creneau, LE_21_A_18H)).toBe(attendu);
    }
  });

  it("retombe sur « Repas » quand le créneau est absent ou inconnu", () => {
    expect(etiquetteRepas('2026-08-21', null, LE_21_A_18H)).toBe('Repas');
    expect(etiquetteRepas('2026-08-21', 'brunch', LE_21_A_18H)).toBe('Repas');
  });

  it("ignore une date illisible plutôt que de lever", () => {
    expect(etiquetteRepas('pas-une-date', 'dinner', LE_21_A_18H)).toBe('Dîner');
  });

  it("ne préfixe pas un jour PASSÉ : un repas en retard reste « Dîner »", () => {
    // Le capteur publie le repas suivant ; un créneau dépassé de peu reste le repas courant, et
    // « Hier, dîner » sur l'écran de la cuisine à 18 h ne servirait personne.
    expect(etiquetteRepas('2026-08-20', 'dinner', LE_21_A_18H)).toBe('Dîner');
  });
});
