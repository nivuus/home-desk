// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { demarrerPage } from '../src/page';
import { ECRANS } from '../src/ecran';
import type { Ecran } from '../src/ecran';

function racineAvec(dataset: Record<string, string> = {}) {
  const el = document.createElement('div');
  for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
  return el;
}

describe('demarrerPage — le chemin NEUF', () => {
  it('passe le nom de ?ecran= au transport, décodé', () => {
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    const racine = racineAvec();
    void demarrerPage(racine, 'https://ha/local/wallpanel/index.html?ecran=Salle%20de%20bain',
                      { demarrer, demarrerAvecEcran });
    expect(demarrer).toHaveBeenCalledWith(racine, 'Salle de bain');
    expect(demarrerAvecEcran).not.toHaveBeenCalled();
  });

  it('gagne sur data-piece quand les deux sont présents', () => {
    // Pendant la migration, une page historique repointée porte les DEUX : son `data-piece`
    // d'origine et le `?ecran=` neuf. Le transport doit gagner, sans quoi repointer une
    // tablette ne changerait rien et l'étape 5 de la mise en production serait un faux vert.
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    void demarrerPage(racineAvec({ piece: 'salon' }),
                      'https://ha/local/wallpanel/salon.html?ecran=Cuisine',
                      { demarrer, demarrerAvecEcran });
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), 'Cuisine');
    expect(demarrerAvecEcran).not.toHaveBeenCalled();
  });
});

describe('demarrerPage — la BRANCHE DE TRANSITION (retirée à l étape 8 du plan 3c)', () => {
  it('sert le littéral ECRANS depuis data-piece, sans aucun aller-retour', () => {
    // C'est CE chemin qui rend le retour arrière des étapes 5 à 7 réel : remettre l'ancienne
    // `startURL` fait charger la page historique, qui lit le littéral — le comportement
    // d'avant, octet pour octet, puisque c'est le même code.
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    const racine = racineAvec({ piece: 'cuisine' });
    void demarrerPage(racine, 'https://ha/local/wallpanel/cuisine.html',
                      { demarrer, demarrerAvecEcran });
    expect(demarrerAvecEcran).toHaveBeenCalledWith(racine, ECRANS.cuisine);
    expect(demarrer).not.toHaveBeenCalled();
  });

  it('les trois clés historiques mènent aux trois écrans — décor à TROIS', () => {
    for (const cle of ['salon', 'bureau', 'cuisine'] as const) {
      const demarrerAvecEcran = vi.fn(async (_racine: HTMLElement, _piece: Ecran) => {});
      void demarrerPage(racineAvec({ piece: cle }), `https://ha/local/wallpanel/${cle}.html`,
                        { demarrer: vi.fn(async () => {}), demarrerAvecEcran });
      expect(demarrerAvecEcran.mock.calls[0][1]).toBe(ECRANS[cle]);
    }
  });

  it('ignore un data-piece qui ne nomme aucun écran connu', () => {
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    void demarrerPage(racineAvec({ piece: 'grenier' }), 'https://ha/local/wallpanel/x.html',
                      { demarrer, demarrerAvecEcran });
    expect(demarrerAvecEcran).not.toHaveBeenCalled();
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), '');
  });
});

describe('demarrerPage — ni l un ni l autre', () => {
  it('demande la liste quand rien n identifie l écran', () => {
    const demarrer = vi.fn(async () => {});
    void demarrerPage(racineAvec(), 'https://ha/local/wallpanel/index.html',
                      { demarrer, demarrerAvecEcran: vi.fn(async () => {}) });
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('traite ?ecran= vide comme absent', () => {
    const demarrer = vi.fn(async () => {});
    void demarrerPage(racineAvec(), 'https://ha/local/wallpanel/index.html?ecran=',
                      { demarrer, demarrerAvecEcran: vi.fn(async () => {}) });
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), '');
  });
});
