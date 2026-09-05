// Tâche 14 (2026-08-03) : `prochainesHeures` et ses tests ont disparu d'ici — le mode
// `previsions` (les six prochaines heures) qu'elle alimentait n'existe plus, remplacé par
// `defaut` (repas en cuisine, agenda au bureau). Plus aucun appelant, cf. `src/meteo.ts`.
import { describe, it, expect } from 'vitest';
import { phraseDemain, temperatureCourte } from '../src/meteo';

const p = (h: string, c: string, t: number, pluie = 0) =>
  ({ datetime: `2026-08-01T${h}:00:00+02:00`, condition: c, temperature: t, precipitation: pluie });

describe('phraseDemain', () => {
  it('annonce la pluie quand il en tombe', () => {
    expect(phraseDemain(p('00', 'rainy', 33.3, 1.5) as any))
      .toBe('33° et de la pluie');
  });

  // Corrigé en ronde 1 : arrondi au plus proche (convention d'affichage météo), pas tronqué —
  // 29,9 °C s'affiche 30°, pas 29°. Le test verbatim d'origine attendait 29° ; c'était le test
  // qui avait tort, pas le code.
  it('se contente de la température quand il ne pleut pas', () => {
    expect(phraseDemain(p('00', 'sunny', 29.9, 0) as any)).toBe('30° et du soleil');
  });

  it('ne dit rien sans prévision plutôt que d inventer', () => {
    expect(phraseDemain(undefined)).toBe('');
  });

  // Cas ajouté (non fourni par le brief) : dans les deux tests ci-dessus, la condition HA
  // ('rainy' / 'sunny') pointe déjà, seule, vers le même mot que la branche précipitation —
  // aucun des deux ne peut donc rougir si la priorité « précipitation > 0,2 mm » disparaît du
  // code (vérifié par mutation : la supprimer entièrement laisse les 5 tests verts). Ce cas
  // choisit une condition ('cloudy' → 'des nuages') qui contredit ce que dirait la pluie, pour
  // qu'un test échoue vraiment si la priorité saute.
  it('la précipitation l a emporte sur la condition quand elles se contredisent', () => {
    expect(phraseDemain(p('00', 'cloudy', 18, 1.5) as any)).toBe('18° et de la pluie');
  });
});

describe('temperatureCourte', () => {
  it('arrondit au plus proche et suffixe le degré', () => {
    expect(temperatureCourte(29.9)).toBe('30°');
    expect(temperatureCourte(29.4)).toBe('29°');
    expect(temperatureCourte(-3.6)).toBe('-4°');
  });

  // `Math.round(-0.4)` vaut `-0` en JavaScript. Sans ce cas, un futur passage par un formateur
  // qui distingue -0 de 0 afficherait « -0° » sur le mur sans que rien ne rougisse.
  it('n\'affiche jamais un zéro négatif', () => {
    expect(temperatureCourte(-0.4)).toBe('0°');
  });

  // LE CONTRAT dont dépend l'accent coloré de la pastille (`Pastille.accent`, tâche 2, puis le
  // garde `startsWith` de `bandeau.ts`, tâche 5) : si `phraseDemain` cessait un jour de commencer
  // par cette température, l'accent serait posé sur le mauvais fragment. Ce test est le seul
  // endroit où cette dépendance est vérifiée.
  it('est le préfixe exact de phraseDemain', () => {
    const prev = p('00', 'sunny', 29.9, 0) as any;
    expect(phraseDemain(prev).startsWith(temperatureCourte(prev.temperature))).toBe(true);
  });
});
