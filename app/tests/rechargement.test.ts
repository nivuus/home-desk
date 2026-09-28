import { describe, it, expect, vi } from 'vitest';
import { armerRechargement } from '../src/rechargement';

/** Un double qui capture les abonnements et permet de pousser un événement à l'un d'eux. */
function bus() {
  const abonnes: { commande: Record<string, unknown>; cb: (d: Record<string, unknown>) => void }[] = [];
  return {
    abonner: vi.fn((commande: Record<string, unknown>, cb: (d: Record<string, unknown>) => void) => {
      abonnes.push({ commande, cb });
    }),
    /** Pousse `donnees` aux abonnements de l'écran `nom`, comme le serveur, qui filtre par nom. */
    pousser(nom: string, donnees: Record<string, unknown>) {
      for (const a of abonnes) if (a.commande.nom === nom) a.cb(donnees);
    },
  };
}

describe('armerRechargement', () => {
  it("s abonne par la commande de l intégration, en valeur littérale, pour CET écran", () => {
    // Pas `subscribe_events` : Home Assistant le refuse à un utilisateur non administrateur,
    // celui des tablettes (mesuré le 2026-09-28). Le nom de la commande traverse la frontière
    // de langage : `const.WS_ABONNER` est calculé côté Python et ne peut pas être importé ici.
    const cx = bus();
    armerRechargement(cx, 'Cuisine', vi.fn());
    expect(cx.abonner).toHaveBeenCalledWith(
      { type: 'home_desk/abonner', nom: 'Cuisine' }, expect.any(Function));
  });

  it('recharge quand l événement porte le nom de CET écran', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('Cuisine', { nom: 'Cuisine' });
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('ne recharge PAS sur un événement portant le nom d un AUTRE écran', () => {
    // Le serveur filtre déjà ; cette épreuve garde la vérification de la charge utile elle-même,
    // avec un décor à deux écrans (leçon 3) : un événement mal adressé ne recharge rien.
    const rechargerCuisine = vi.fn();
    const rechargerSalon = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', rechargerCuisine);
    armerRechargement(cx, 'Salon', rechargerSalon);

    cx.pousser('Cuisine', { nom: 'Salon' });
    cx.pousser('Salon', { nom: 'Salon' });

    expect(rechargerCuisine).not.toHaveBeenCalled();
    expect(rechargerSalon).toHaveBeenCalledTimes(1);
  });

  it('ignore un événement sans nom plutôt que de recharger à l aveugle', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('Cuisine', {});
    cx.pousser('Cuisine', { nom: 42 });
    expect(recharger).not.toHaveBeenCalled();
  });

  it('recharge à CHAQUE édition, pas seulement à la première', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('Cuisine', { nom: 'Cuisine' });
    cx.pousser('Cuisine', { nom: 'Cuisine' });
    expect(recharger).toHaveBeenCalledTimes(2);
  });
});
