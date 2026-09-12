import { describe, it, expect } from 'vitest';
import { AGENCEMENT_DEFAUT, resoudreAgencement } from '../src/agencement';
import { ECRANS } from '../src/ecran';
import { ecranVide } from './aides';

describe('resoudreAgencement', () => {
  it('rend le defaut pour un ecran qui ne declare rien', () => {
    expect(resoudreAgencement(ecranVide)).toEqual(AGENCEMENT_DEFAUT);
  });

  it('le defaut ordonne les zones comme le gabarit les ecrivait', () => {
    expect(AGENCEMENT_DEFAUT.zones).toEqual(
      ['ambiances', 'commandes', 'blocCentral', 'synthese']);
  });

  it('le defaut active les neuf modes, alerte en tete et defaut en queue', () => {
    expect(AGENCEMENT_DEFAUT.modes[0]).toBe('alerte');
    expect(AGENCEMENT_DEFAUT.modes[AGENCEMENT_DEFAUT.modes.length - 1]).toBe('defaut');
    expect(AGENCEMENT_DEFAUT.modes).toHaveLength(9);
  });

  it('rend la declaration de l ecran quand il en porte une', () => {
    expect(resoudreAgencement(ECRANS.salon)).toEqual(ECRANS.salon.agencement);
  });
});

describe('les trois ecrans declarent ce qui etait deduit', () => {
  it('un mode minuteur declare implique des slots de minuteur, et reciproquement', () => {
    for (const [nom, e] of Object.entries(ECRANS)) {
      const a = resoudreAgencement(e);
      expect(a.modes.includes('minuteur'), nom).toBe((e.minuteurs?.length ?? 0) > 0);
    }
  });

  it('un mode aeration declare implique des ouvrants, et reciproquement', () => {
    for (const [nom, e] of Object.entries(ECRANS)) {
      const a = resoudreAgencement(e);
      expect(a.modes.includes('aeration'), nom).toBe(e.ouvrants.length > 0);
    }
  });

  it('un bloc central voiture declare implique les entites de la voiture', () => {
    for (const [nom, e] of Object.entries(ECRANS)) {
      const a = resoudreAgencement(e);
      expect(a.blocDefaut === 'voiture', nom).toBe(e.voiture !== undefined);
    }
  });

  it('tout mode declare est un mode que modes.ts connait', () => {
    const connus = ['alerte', 'recette', 'minuteur', 'menage', 'cinema', 'media',
                    'aeration', 'voiture', 'defaut'];
    for (const [nom, e] of Object.entries(ECRANS)) {
      for (const m of resoudreAgencement(e).modes) expect(connus, nom).toContain(m);
    }
  });
});

/** L'AIDE « SOUS-SUITE ORDONNÉE », écrite ici plutôt qu'empruntée : une passe d'index, aucune
 *  bibliothèque. Elle répond à « chaque élément de `sousSuite` figure dans `reference`, et dans
 *  le même ORDRE RELATIF » — pas à « les mêmes éléments », qui laisserait passer une permutation,
 *  ni à « un préfixe », qui interdirait un retrait au milieu. C'est exactement la forme que prend
 *  la promesse ci-dessous : un écran RETIRE des modes du défaut, il n'en réordonne jamais. */
function estSousSuiteOrdonnee<T>(sousSuite: readonly T[], reference: readonly T[]): boolean {
  let i = 0;
  for (const element of sousSuite) {
    while (i < reference.length && reference[i] !== element) i++;
    if (i === reference.length) return false;
    i++;
  }
  return true;
}

/** LA PROMESSE CENTRALE DU PLAN 2, ÉNONCÉE LITTÉRALEMENT — « les trois tablettes affichent
 *  exactement ce qu'elles affichaient ».
 *
 *  Elle était vraie et prouvée par rien : la relecture finale de branche a montré DEUX mutations
 *  qui laissaient la suite entièrement verte — réordonner `ECRANS.cuisine.agencement.zones` (le
 *  bloc central au-dessus des commandes, soit un écran réordonné), et réordonner ses `modes`
 *  (`media` avant `minuteur`, soit une cuisson qui bascule en mode média pendant une playlist,
 *  exactement ce que `CONDITIONS.minuteur` argumente : « une cuisson a une échéance, une playlist
 *  n'en a pas »). Aucune assertion ne les voyait : `tests/modes.test.ts` cloue la priorité du
 *  DÉFAUT, que les trois écrans ne lisent justement plus.
 *
 *  Deux relations distinctes, et c'est le fond du sujet :
 *  - les ZONES sont ÉGALES au défaut, ordre compris — aucun écran n'en retire ni n'en déplace
 *    une, donc l'égalité est la promesse la plus forte qui soit vraie ;
 *  - les MODES et les MODULATEURS sont des SOUS-SUITES ORDONNÉES — un écran en retire (le salon
 *    n'a ni `recette` ni `minuteur`, le bureau pas d'`aeration`), jamais n'en réordonne. */
describe('la promesse du plan 2 : les trois ecrans ne reordonnent rien', () => {
  for (const [nom, ecran] of Object.entries(ECRANS)) {
    it(`${nom} : zones egales au defaut, modes et modulateurs sous-suites ordonnees`, () => {
      const a = resoudreAgencement(ecran);
      expect(a.zones,
        `${nom} : ses zones ne sont pas celles du defaut, l ecran serait reordonne`)
        .toEqual(AGENCEMENT_DEFAUT.zones);
      expect(estSousSuiteOrdonnee(a.modes, AGENCEMENT_DEFAUT.modes),
        `${nom} : modes ${JSON.stringify(a.modes)} n est pas une sous-suite ORDONNEE de `
        + `${JSON.stringify(AGENCEMENT_DEFAUT.modes)} — un mode a ete ajoute ou deplace, `
        + 'donc la priorite d exclusivite de cet ecran a change')
        .toBe(true);
      expect(estSousSuiteOrdonnee(a.modulateurs, AGENCEMENT_DEFAUT.modulateurs),
        `${nom} : modulateurs ${JSON.stringify(a.modulateurs)} n est pas une sous-suite ORDONNEE `
        + `de ${JSON.stringify(AGENCEMENT_DEFAUT.modulateurs)}`)
        .toBe(true);
    });
  }

  /** L'aide elle-meme, sur ses trois cas limites : sans eux, une aide qui rendrait `true` partout
   *  (ou qui comparerait des ensembles) passerait les trois tests ci-dessus sans rien garder. */
  it('l aide distingue un retrait d un reordonnancement', () => {
    expect(estSousSuiteOrdonnee(['a', 'c'], ['a', 'b', 'c'])).toBe(true);
    expect(estSousSuiteOrdonnee(['c', 'a'], ['a', 'b', 'c'])).toBe(false);
    expect(estSousSuiteOrdonnee(['a', 'z'], ['a', 'b', 'c'])).toBe(false);
  });
});
