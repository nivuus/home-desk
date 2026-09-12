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
