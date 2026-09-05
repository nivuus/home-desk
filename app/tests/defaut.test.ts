// @vitest-environment jsdom
//
// Tâche 14 : les deux blocs qui remplacent les six prochaines heures en cuisine et au bureau
// (demande du propriétaire, 2026-08-03 — les prévisions horaires disparaissent partout, cf.
// `pieces.ts`, champ `Piece.blocDefaut`). Fonctions de présentation pures, même discipline que
// `tests/rendu-modes.test.ts` (ménage/aération) : aucun état HA lu directement, tout arrive en
// paramètre.
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'lit';
import {
  rendreProchainRdv, rendreEntretien, rendreRepasSuivant, rendreRecetteReduite,
} from '../src/rendu/defaut';
import type { Evenement } from '../src/agenda';
import type { RepasSuivant } from '../src/garde-manger';

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

describe('rendreProchainRdv', () => {
  const maintenant = new Date('2026-08-03T14:00:00+02:00');

  it('rend undefined sans aucun événement', () => {
    expect(rendreProchainRdv([], maintenant)).toBeUndefined();
  });

  it('affiche l\'heure et le résumé du prochain rendez-vous du jour', () => {
    const div = document.createElement('div');
    const evenements: Evenement[] = [
      { resume: 'Réunion client', debut: '2026-08-03T16:30:00+02:00', estAnniversaire: false },
    ];
    render(rendreProchainRdv(evenements, maintenant)!, div);
    expect(div.querySelector('.mode-bloc .t')?.textContent).toBe('Rendez-vous');
    expect(div.querySelector('.mode-bloc .v')?.textContent).toBe('16:30 — Réunion client');
  });

  it('choisit le plus proche parmi plusieurs rendez-vous à venir aujourd\'hui', () => {
    const div = document.createElement('div');
    const evenements: Evenement[] = [
      { resume: 'Le plus tard', debut: '2026-08-03T19:00:00+02:00', estAnniversaire: false },
      { resume: 'Le plus proche', debut: '2026-08-03T15:00:00+02:00', estAnniversaire: false },
    ];
    render(rendreProchainRdv(evenements, maintenant)!, div);
    expect(div.querySelector('.mode-bloc .v')?.textContent).toBe('15:00 — Le plus proche');
  });

  it('ignore un rendez-vous déjà commencé', () => {
    const evenements: Evenement[] = [
      { resume: 'Déjà passé', debut: '2026-08-03T13:00:00+02:00', estAnniversaire: false },
    ];
    expect(rendreProchainRdv(evenements, maintenant)).toBeUndefined();
  });

  it('ignore un rendez-vous du lendemain', () => {
    const evenements: Evenement[] = [
      { resume: 'Demain', debut: '2026-08-04T09:00:00+02:00', estAnniversaire: false },
    ];
    expect(rendreProchainRdv(evenements, maintenant)).toBeUndefined();
  });

  // Un anniversaire est un événement de la journée entière, sans heure : il n'a rien à faire dans
  // un bloc qui promet « l'heure et le résumé » (cf. brief de tâche 14). Même écart déjà fait par
  // `pastilleBandeau` (`agenda.ts`) pour sa propre fenêtre de rendez-vous proches.
  it('ignore un anniversaire, qui n\'a pas d\'heure', () => {
    const evenements: Evenement[] = [
      { resume: 'Anniversaire de Soraya', debut: '2026-08-03', estAnniversaire: true },
    ];
    expect(rendreProchainRdv(evenements, maintenant)).toBeUndefined();
  });

  it('ne rend jamais de .mode-action (aucune action possible sur ce bloc)', () => {
    const div = document.createElement('div');
    const evenements: Evenement[] = [
      { resume: 'Réunion', debut: '2026-08-03T16:30:00+02:00', estAnniversaire: false },
    ];
    render(rendreProchainRdv(evenements, maintenant)!, div);
    expect(div.querySelector('.mode-action')).toBeNull();
  });
});

// Tâche 17 (2026-08-03) : le REPLI des deux blocs ci-dessus. Constat de terrain, captures des
// trois tablettes à 21 h 07 — la cuisine laissait ~185 px de fond nu (aucun plat planifié) et le
// bureau ~175 px (agenda vide ce soir-là). Les tâches d'entretien prennent la place
// quand le repas/le rendez-vous n'ont rien à dire (décision du propriétaire).
//
// LIBELLÉS RÉELS, jamais inventés : les résumés viennent de `maintenance_plan()`
// (`config/custom_templates/maintenance.jinja`, macro qui construit `todo.maintenance`) et sont
// LONGS — « Aspirateur RDC — brosse principale à remplacer » fait 46 caractères, le pourcentage
// restant vit dans la DESCRIPTION de la tâche, jamais dans son résumé (que `listerTaches` est seul
// à rapporter, cf. `connexion.ts`). C'est ce fait mesuré, et non un libellé court supposé, qui
// impose le clamp à deux lignes ET le compte porté par le titre ci-dessous.
describe('rendreEntretien', () => {
  const TACHES = [
    { uid: '1', texte: 'Aspirateur RDC — brosse principale à remplacer' },
    { uid: '2', texte: 'Purificateur — filtre à remplacer' },
    { uid: '3', texte: 'Arroser Plante Télévision' },
  ];

  it('rend undefined sans aucune tâche d\'entretien (jamais un cadre creux)', () => {
    expect(rendreEntretien([])).toBeUndefined();
  });

  it('écarte les libellés vides, rend undefined s\'il n\'en reste aucun', () => {
    expect(rendreEntretien([{ uid: '1', texte: '' }, { uid: '2', texte: '   ' }])).toBeUndefined();
  });

  it('affiche le libellé de l\'unique tâche, avec un titre au singulier', () => {
    const div = document.createElement('div');
    const r = rendreEntretien([TACHES[1]]);
    expect(r).not.toBeUndefined();
    render(r!, div);
    expect(div.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 1 tâche');
    expect(div.querySelector('.mode-bloc .v')?.textContent).toBe('Purificateur — filtre à remplacer');
  });

  // Le compte du titre est ce qui remplace, sur cet écran, l'écart « 3 tâches d'entretien » de la
  // ligne de synthèse (masqué par `masquerEntretien`, cf. `rendu/corps.ts`) : sans lui, le repli
  // ferait DISPARAÎTRE une information au lieu de la déplacer, puisque le clamp à deux lignes ne
  // peut pas montrer trois libellés de cette longueur.
  it('joint les libellés par « · » et annonce leur nombre dans le titre', () => {
    const div = document.createElement('div');
    render(rendreEntretien(TACHES)!, div);
    expect(div.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 3 tâches');
    expect(div.querySelector('.mode-bloc .v')?.textContent).toBe(
      'Aspirateur RDC — brosse principale à remplacer · Purificateur — filtre à remplacer'
      + ' · Arroser Plante Télévision');
  });

  it('compte les tâches RETENUES, jamais les libellés vides écartés', () => {
    const div = document.createElement('div');
    render(rendreEntretien([{ uid: '0', texte: '  ' }, ...TACHES.slice(0, 2)])!, div);
    expect(div.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 2 tâches');
    expect(div.querySelector('.mode-bloc .v')?.textContent).toBe(
      'Aspirateur RDC — brosse principale à remplacer · Purificateur — filtre à remplacer');
  });

  // Le SEUL garde-fou de hauteur du bloc : sans `deux-lignes`, `.mode-bloc .v` est en
  // `white-space: nowrap` (`base.css`) et trois résumés de 46 caractères seraient coupés à la
  // première ligne. Avec, la hauteur du bloc est identique à celle de `rendreRepasSuivant`/
  // `rendreProchainRdv` quel que soit le nombre de tâches — c'est ce qui garantit que le repli ne
  // coûte pas une commande de plus que les blocs qu'il remplace (`combien`, `modes.ts`).
  it('borne la valeur à deux lignes, quel que soit le nombre de tâches', () => {
    const div = document.createElement('div');
    render(rendreEntretien(TACHES)!, div);
    expect(div.querySelector('.mode-bloc .v')?.classList.contains('deux-lignes')).toBe(true);
  });

  // On ne coche pas une tâche d'entretien depuis l'accueil : `script.maintenance_valider_taches`
  // existe, mais reste dans la vue « Tâches » — le propriétaire n'a demandé aucun geste ici.
  it('ne rend jamais de .mode-action (aucune action possible sur ce bloc)', () => {
    const div = document.createElement('div');
    render(rendreEntretien(TACHES)!, div);
    expect(div.querySelector('.mode-action')).toBeNull();
  });
});

// Lot 6 (2026-08-21) : le repas SUIVANT vient des attributs de `sensor.home_stock_next_meal`
// (`repasSuivant`, `src/garde-manger.ts`). La SOURCE a changé, le gabarit pas d'un pixel — c'est
// le contrat de hauteur, tenu ici par une assertion de structure, avant même le navigateur.
function peindre(t: ReturnType<typeof rendreRepasSuivant>): HTMLElement {
  const hote = document.createElement('div');
  if (t) render(t, hote);
  return hote;
}

/** Un `RepasSuivant` de `src/garde-manger.ts`, tel que `repasSuivant` le produit. */
function repas(p: Partial<RepasSuivant> = {}): RepasSuivant {
  return { etiquette: 'Dîner', plat: 'Bol lentilles', mealId: 42, recetteId: 12,
           manquants: 0, ...p };
}

describe('rendreRepasSuivant', () => {
  it("rend le bloc repas depuis un RepasSuivant de garde-manger", () => {
    const hote = peindre(rendreRepasSuivant(repas()));
    expect(hote.querySelector('.t')?.textContent).toBe('Dîner');
    expect(hote.querySelector('.v')?.textContent).toContain('Bol lentilles');
  });

  it('garde exactement le gabarit .mode-bloc / .t / .v.deux-lignes', () => {
    // Le contrat de HAUTEUR, tenu par une assertion de structure : c'est ce qui garantit « zéro
    // pixel ajouté » avant même de lancer le navigateur.
    const hote = peindre(rendreRepasSuivant(repas()));
    const bloc = hote.querySelector('.mode-bloc')!;
    expect(bloc.getAttribute('data-mvt')).toBe('bloc:repas');
    expect(bloc.querySelector('.mode-texte .t')).not.toBeNull();
    expect(bloc.querySelector('.mode-texte .v.deux-lignes')).not.toBeNull();
    expect(bloc.querySelector('.mode-action')).toBeNull();
  });

  it('ouvre la vue recette au contact quand il y a une recette', () => {
    const hote = peindre(rendreRepasSuivant(repas({ recetteId: 12 })));
    location.hash = '';
    hote.querySelector('.mode-bloc')!.dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('#recette');
  });

  it('reste inerte pour un repas sans recette (une note, un produit)', () => {
    // Un bloc qui répond au contact sans rien ouvrir est le bouton mort que ce projet traque
    // partout.
    const hote = peindre(rendreRepasSuivant(repas({ plat: 'Reste quinoa', recetteId: null })));
    location.hash = '';
    hote.querySelector('.mode-bloc')!.dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('');
  });

  it("ne rend rien quand le repas est undefined", () => {
    expect(rendreRepasSuivant(undefined)).toBeUndefined();
  });

  it('rend undefined sur un plat vide', () => {
    expect(rendreRepasSuivant(repas({ plat: '  ' }))).toBeUndefined();
  });
});

describe('rendreRecetteReduite', () => {
  it('affiche l_étape et le plat', () => {
    const hote = peindre(rendreRecetteReduite({ etape: 2, total: 3, plat: 'Bol lentilles' }));
    expect(hote.querySelector('.t')?.textContent).toBe('Étape 2/3');
    expect(hote.querySelector('.v')?.textContent).toContain('Bol lentilles');
  });

  it('ajoute le décompte du minuteur le plus urgent quand il y en a un', () => {
    const hote = peindre(rendreRecetteReduite({
      etape: 2, total: 3, plat: 'Bol lentilles', restantS: 452,
    }));
    expect(hote.querySelector('.t')?.textContent).toBe('Étape 2/3 · 07:32');
  });

  it('rouvre la recette au contact', () => {
    const hote = peindre(rendreRecetteReduite({ etape: 1, total: 2, plat: 'X' }));
    location.hash = '';
    hote.querySelector('.mode-bloc')!.dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('#recette');
  });
});
