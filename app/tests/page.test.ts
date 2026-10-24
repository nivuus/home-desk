// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { startPage } from '../src/page';
import { ECRANS } from '../src/ecran';
import type { Ecran } from '../src/ecran';

function racineAvec(dataset: Record<string, string> = {}) {
  const el = document.createElement('div');
  for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
  return el;
}

describe('startPage — le chemin NEUF', () => {
  it('passe le nom de ?ecran= au transport, décodé', () => {
    const startScreen = vi.fn(async () => {});
    const startWithScreen = vi.fn(async () => {});
    const racine = racineAvec();
    void startPage(racine, 'https://ha/local/wallpanel/index.html?ecran=Salle%20de%20bain',
                      { startScreen, startWithScreen });
    expect(startScreen).toHaveBeenCalledWith(racine, 'Salle de bain');
    expect(startWithScreen).not.toHaveBeenCalled();
  });

  it('gagne sur data-piece quand les deux sont présents', () => {
    // Pendant la migration, une page historique repointée porte les DEUX : son `data-piece`
    // d'origine et le `?ecran=` neuf. Le transport doit gagner, sans quoi repointer une
    // tablette ne changerait rien et l'étape 5 de la mise en production serait un faux vert.
    const startScreen = vi.fn(async () => {});
    const startWithScreen = vi.fn(async () => {});
    void startPage(racineAvec({ piece: 'salon' }),
                      'https://ha/local/wallpanel/salon.html?ecran=Cuisine',
                      { startScreen, startWithScreen });
    expect(startScreen).toHaveBeenCalledWith(expect.anything(), 'Cuisine');
    expect(startWithScreen).not.toHaveBeenCalled();
  });
});

describe('startPage — la BRANCHE DE TRANSITION (retirée à l étape 8 du plan 3c)', () => {
  it('sert le littéral ECRANS depuis data-piece, sans aucun aller-retour', () => {
    // C'est CE chemin qui rend le retour arrière des étapes 5 à 7 réel : remettre l'ancienne
    // `startURL` fait charger la page historique, qui lit le littéral — le comportement
    // d'avant, octet pour octet, puisque c'est le même code.
    const startScreen = vi.fn(async () => {});
    const startWithScreen = vi.fn(async () => {});
    const racine = racineAvec({ piece: 'cuisine' });
    void startPage(racine, 'https://ha/local/wallpanel/cuisine.html',
                      { startScreen, startWithScreen });
    expect(startWithScreen).toHaveBeenCalledWith(racine, ECRANS.cuisine);
    expect(startScreen).not.toHaveBeenCalled();
  });

  it('les trois clés historiques mènent aux trois écrans — décor à TROIS', () => {
    for (const cle of ['salon', 'bureau', 'cuisine'] as const) {
      const startWithScreen = vi.fn(async (_racine: HTMLElement, _piece: Ecran) => {});
      void startPage(racineAvec({ piece: cle }), `https://ha/local/wallpanel/${cle}.html`,
                        { startScreen: vi.fn(async () => {}), startWithScreen });
      expect(startWithScreen.mock.calls[0][1]).toBe(ECRANS[cle]);
    }
  });

  it('ignore un data-piece qui ne nomme aucun écran connu', () => {
    const startScreen = vi.fn(async () => {});
    const startWithScreen = vi.fn(async () => {});
    void startPage(racineAvec({ piece: 'grenier' }), 'https://ha/local/wallpanel/x.html',
                      { startScreen, startWithScreen });
    expect(startWithScreen).not.toHaveBeenCalled();
    expect(startScreen).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('un ?ecran= vide avec data-piece présent sert quand même le littéral', () => {
    // Scénario réel de la mise en production, pas théorique : une page HISTORIQUE (qui porte
    // `data-piece`) repointée avec une URL malformée où `?ecran=` est vide. C'est le seul cas où
    // `if (nom)` et `if (nom !== null)` divergent : sans `data-piece` posé, les deux écritures
    // retombent sur le même `startScreen(racine, '')` et rien ne les distingue (mesuré). Avec
    // `data-piece` présent, `if (nom !== null)` partirait sur le transport avec un nom vide — la
    // liste tapable, littéral ignoré — alors que `if (nom)` tombe dans la branche de transition
    // et sert le littéral : le comportement d'avant, celui que la branche doit garantir.
    const startScreen = vi.fn(async () => {});
    const startWithScreen = vi.fn(async () => {});
    const racine = racineAvec({ piece: 'bureau' });
    void startPage(racine, 'https://ha/local/wallpanel/bureau.html?ecran=',
                      { startScreen, startWithScreen });
    expect(startWithScreen).toHaveBeenCalledWith(racine, ECRANS.bureau);
    expect(startScreen).not.toHaveBeenCalled();
  });
});

describe('startPage — ni l un ni l autre', () => {
  it('demande la liste quand rien n identifie l écran', () => {
    const startScreen = vi.fn(async () => {});
    void startPage(racineAvec(), 'https://ha/local/wallpanel/index.html',
                      { startScreen, startWithScreen: vi.fn(async () => {}) });
    expect(startScreen).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('traite ?ecran= vide comme absent', () => {
    const startScreen = vi.fn(async () => {});
    void startPage(racineAvec(), 'https://ha/local/wallpanel/index.html?ecran=',
                      { startScreen, startWithScreen: vi.fn(async () => {}) });
    expect(startScreen).toHaveBeenCalledWith(expect.anything(), '');
  });
});
