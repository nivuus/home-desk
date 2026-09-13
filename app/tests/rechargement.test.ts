import { describe, it, expect, vi } from 'vitest';
import { armerRechargement } from '../src/rechargement';

/** Un double qui capture les abonnements et permet de pousser un événement. */
function bus() {
  const abonnes = new Map<string, ((d: Record<string, unknown>) => void)[]>();
  return {
    surEvenement: vi.fn((type: string, cb: (d: Record<string, unknown>) => void) => {
      const l = abonnes.get(type);
      if (l) l.push(cb); else abonnes.set(type, [cb]);
    }),
    pousser(type: string, donnees: Record<string, unknown>) {
      for (const cb of abonnes.get(type) ?? []) cb(donnees);
    },
  };
}

describe('armerRechargement', () => {
  it("s abonne à home_desk_config_changed, en valeur littérale", () => {
    // Le nom de l'événement traverse la frontière de langage : `const.EVENEMENT_CHANGEMENT`
    // est calculé côté Python (`f"{DOMAIN}_config_changed"`) et ne peut pas être importé ici.
    const cx = bus();
    armerRechargement(cx, 'Cuisine', vi.fn());
    expect(cx.surEvenement).toHaveBeenCalledWith(
      'home_desk_config_changed', expect.any(Function));
  });

  it('recharge quand l événement porte le nom de CET écran', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('home_desk_config_changed', { nom: 'Cuisine' });
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('ne recharge PAS sur l événement d un AUTRE écran — décor à deux écrans', () => {
    // Leçon 3, et elle a déjà coûté deux tests aveugles sur ce chantier : avec un seul écran
    // au décor, une implémentation qui rechargerait sur TOUT événement passerait le test
    // précédent sans qu'on s'en aperçoive. Les trois tablettes de cette maison écoutent le
    // MÊME bus : sans ce filtre, éditer le salon rechargerait la cuisine et le bureau.
    const rechargerCuisine = vi.fn();
    const rechargerSalon = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', rechargerCuisine);
    armerRechargement(cx, 'Salon', rechargerSalon);

    cx.pousser('home_desk_config_changed', { nom: 'Salon' });

    expect(rechargerCuisine).not.toHaveBeenCalled();
    expect(rechargerSalon).toHaveBeenCalledTimes(1);
  });

  it('ignore un événement sans nom plutôt que de recharger à l aveugle', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('home_desk_config_changed', {});
    cx.pousser('home_desk_config_changed', { nom: 42 });
    expect(recharger).not.toHaveBeenCalled();
  });

  it('recharge à CHAQUE édition, pas seulement à la première', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('home_desk_config_changed', { nom: 'Cuisine' });
    cx.pousser('home_desk_config_changed', { nom: 'Cuisine' });
    expect(recharger).toHaveBeenCalledTimes(2);
  });
});
