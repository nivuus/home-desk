// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rendreMinuteurs, tuileMinuteur, brancherMinuteur, ecrireTemps, rendreReglageMinuteur,
  type ActionsMinuteur,
} from '../src/rendu/minuteur';
import type { VueMinuteur } from '../src/minuteur';

function actions(): ActionsMinuteur & Record<string, ReturnType<typeof vi.fn>> {
  return {
    ouvrir: vi.fn(), fermer: vi.fn(), changerDuree: vi.fn(), choisirEtiquette: vi.fn(),
    demarrer: vi.fn(), pause: vi.fn(), reprendre: vi.fn(), annuler: vi.fn(), ajuster: vi.fn(),
  } as any;
}

function rendre(t: any): HTMLElement {
  const el = document.createElement('div');
  render(t, el);
  return el;
}

function vue(p: Partial<VueMinuteur> = {}): VueMinuteur {
  return {
    slot: 0, timer: 'timer.cuisine', nomEntite: 'input_text.minuteur_cuisine_nom',
    nom: '', actif: true, restantS: 300, ...p,
  };
}

let a: ReturnType<typeof actions>;
beforeEach(() => { a = actions(); brancherMinuteur(a); });

describe('rendreMinuteurs — forme solo', () => {
  it('affiche le temps, et propose −5 / +5 / pause / annuler', () => {
    const el = rendre(rendreMinuteurs([vue({ restantS: 754 })], true));
    expect(el.querySelector('.mn-temps')!.textContent).toBe('12:34');
    expect(el.querySelectorAll('.mn-bouton')).toHaveLength(4);
  });

  it('appelle les actions du bon slot', () => {
    const el = rendre(rendreMinuteurs([vue({ slot: 2, restantS: 754 })], true));
    const boutons = el.querySelectorAll<HTMLElement>('.mn-bouton');
    for (const b of Array.from(boutons)) b.dispatchEvent(new Event('pointerdown'));
    expect(a.ajuster).toHaveBeenCalledWith(2, -300);
    expect(a.ajuster).toHaveBeenCalledWith(2, 300);
    expect(a.pause).toHaveBeenCalledWith(2);
    expect(a.annuler).toHaveBeenCalledWith(2);
  });

  it('retire −5 quand il reste moins de cinq minutes — jamais un bouton mort', () => {
    const el = rendre(rendreMinuteurs([vue({ restantS: 299 })], true));
    expect(el.querySelector('[data-action="moins"]')).toBeNull();
    expect(el.querySelector('[data-action="plus"]')).not.toBeNull();
  });

  it('propose Reprendre, et non Pause, sur un minuteur en pause', () => {
    const el = rendre(rendreMinuteurs([vue({ actif: false })], true));
    el.querySelector<HTMLElement>('[data-action="marche"]')!.dispatchEvent(new Event('pointerdown'));
    expect(a.reprendre).toHaveBeenCalledWith(0);
    expect(a.pause).not.toHaveBeenCalled();
  });

  it('retire ± 5 sur un minuteur en pause — l\'ajustement le relancerait', () => {
    const el = rendre(rendreMinuteurs([vue({ actif: false, restantS: 900 })], true));
    expect(el.querySelector('[data-action="moins"]')).toBeNull();
    expect(el.querySelector('[data-action="plus"]')).toBeNull();
    expect(el.querySelector('[data-action="marche"]')).not.toBeNull();
  });

  it('affiche le nom quand il existe, le numéro sinon', () => {
    expect(rendre(rendreMinuteurs([vue({ nom: 'Pâtes' })], true))
      .querySelector('.mn-nom')!.textContent).toContain('Pâtes');
    expect(rendre(rendreMinuteurs([vue({ slot: 1 })], true))
      .querySelector('.mn-nom')!.textContent).toContain('2');
  });
});

describe('rendreMinuteurs — liste', () => {
  it('rend une ligne par minuteur, dans l\'ordre reçu', () => {
    const el = rendre(rendreMinuteurs(
      [vue({ slot: 0, restantS: 60 }), vue({ slot: 1, restantS: 120 })], true));
    const temps = Array.from(el.querySelectorAll('.mn-temps')).map((n) => n.textContent);
    expect(temps).toEqual(['01:00', '02:00']);
  });

  it('n\'affiche « Nouveau » que s\'il reste un emplacement', () => {
    const trois = [vue({ slot: 0 }), vue({ slot: 1 }), vue({ slot: 2 })];
    expect(rendre(rendreMinuteurs(trois, false)).querySelector('[data-action="nouveau"]')).toBeNull();
    expect(rendre(rendreMinuteurs(trois.slice(0, 2), true))
      .querySelector('[data-action="nouveau"]')).not.toBeNull();
  });

  it('marque chaque temps de son slot, pour que le tic sache où écrire', () => {
    const el = rendre(rendreMinuteurs([vue({ slot: 0 }), vue({ slot: 2 })], true));
    expect(Array.from(el.querySelectorAll('.mn-temps')).map((n) => n.getAttribute('data-minuteur')))
      .toEqual(['0', '2']);
  });

  it('ne pose jamais data-mvt sur un temps — le rôle chiffre du moteur ne doit pas y toucher',
    () => {
      const el = rendre(rendreMinuteurs([vue()], true));
      expect(el.querySelector('.mn-temps')!.hasAttribute('data-mvt')).toBe(false);
    });
});

// Tâche 7 (mouvement, 2026-08-22) : couverture — chaque forme (solo, liste, réglage) et ses
// éléments qui apparaissent/disparaissent (étiquettes, bouton « Démarrer »/« Nouveau », pas ±5)
// portent une marque, pour que le moteur (`src/mouvement/moteur.ts`) les anime plutôt que de les
// faire sauter sec.
describe('marques de mouvement', () => {
  it('la forme solo porte une marque de bloc, distincte de la liste', () => {
    const el = rendre(rendreMinuteurs([vue()], true));
    expect(el.querySelector('.mn-solo')?.getAttribute('data-mvt')).toBe('bloc:minuteur-solo');
  });

  it('la forme liste porte sa propre marque de bloc', () => {
    const el = rendre(rendreMinuteurs([vue({ slot: 0 }), vue({ slot: 1 })], true));
    expect(el.querySelector('.minuteurs:not(.mn-solo)')?.getAttribute('data-mvt'))
      .toBe('bloc:minuteurs');
  });

  it('les pas ±5 de la forme solo sont marqués par slot, jamais par index', () => {
    const el = rendre(rendreMinuteurs([vue({ slot: 2, restantS: 754 })], true));
    expect(el.querySelector('[data-action="moins"]')?.getAttribute('data-mvt'))
      .toBe('detail:mn-moins-2');
    expect(el.querySelector('[data-action="plus"]')?.getAttribute('data-mvt'))
      .toBe('detail:mn-plus-2');
  });

  it('le bouton « Nouveau » de la liste porte sa marque', () => {
    // Un seul minuteur rendrait la forme SOLO (vues.length === 1, cf. rendreMinuteurs) : deux
    // minuteurs pour forcer la forme liste et voir « Nouveau ».
    const el = rendre(rendreMinuteurs([vue({ slot: 0 }), vue({ slot: 1 })], true));
    expect(el.querySelector('[data-action="nouveau"]')?.getAttribute('data-mvt'))
      .toBe('detail:mn-nouveau');
  });

  it('les étiquettes et le bouton « Démarrer » du réglage sont marqués', () => {
    const el = rendre(rendreReglageMinuteur(7, null, ['Pâtes', 'Four']));
    expect(el.querySelector('.mn-etiquettes')?.getAttribute('data-mvt')).toBe('detail:mn-etiquettes');
    expect(el.querySelector('[data-action="demarrer"]')?.getAttribute('data-mvt'))
      .toBe('detail:mn-nouveau');
  });

  // Round de correction 1 (revue) : les pas ± 5 DU RÉGLAGE (avant tout lancement, donc sans slot)
  // avaient été omis à tort — ils apparaissent/disparaissent bel et bien aux bornes 1 et 120 min.
  // Clé littérale fixe (« reglage »), même patron que .mn-etiquettes/.mn-nouveau ci-dessus : un
  // seul écran de réglage possible à la fois.
  it('les pas ±5 du réglage portent une clé littérale fixe, jamais un slot', () => {
    const el = rendre(rendreReglageMinuteur(7, null, []));
    expect(el.querySelector('[data-action="moins"]')?.getAttribute('data-mvt'))
      .toBe('detail:mn-moins-reglage');
    expect(el.querySelector('[data-action="plus"]')?.getAttribute('data-mvt'))
      .toBe('detail:mn-plus-reglage');
  });
});

describe('tuileMinuteur', () => {
  it('ouvre le réglage quand un emplacement est libre', () => {
    const el = rendre(tuileMinuteur(false));
    el.querySelector<HTMLElement>('.ambiance')!.dispatchEvent(new Event('pointerdown'));
    expect(a.ouvrir).toHaveBeenCalled();
  });

  it('n\'ouvre rien et se marque inactive quand les trois sont pris', () => {
    const el = rendre(tuileMinuteur(true));
    const tuile = el.querySelector<HTMLElement>('.ambiance')!;
    tuile.dispatchEvent(new Event('pointerdown'));
    expect(a.ouvrir).not.toHaveBeenCalled();
    expect(tuile.classList.contains('inactif')).toBe(true);
  });
});

describe('rendreReglageMinuteur', () => {
  const ETIQUETTES = ['Pâtes', 'Four', 'Riz', 'Œufs', 'Thé'];

  it('affiche la durée en minutes et les deux pas', () => {
    const el = rendre(rendreReglageMinuteur(7, null, ETIQUETTES));
    expect(el.querySelector('.mn-duree')!.textContent).toContain('7 min');
    el.querySelector<HTMLElement>('[data-action="moins"]')!.dispatchEvent(new Event('pointerdown'));
    el.querySelector<HTMLElement>('[data-action="plus"]')!.dispatchEvent(new Event('pointerdown'));
    expect(a.changerDuree).toHaveBeenNthCalledWith(1, -5);
    expect(a.changerDuree).toHaveBeenNthCalledWith(2, 5);
  });

  it('rend une étiquette par entrée déclarée et signale celle qui est choisie', () => {
    const el = rendre(rendreReglageMinuteur(7, 'Four', ETIQUETTES));
    const tags = Array.from(el.querySelectorAll<HTMLElement>('.mn-etiquette'));
    expect(tags.map((t) => t.textContent!.trim())).toEqual(ETIQUETTES);
    expect(tags.filter((t) => t.classList.contains('choisie')).map((t) => t.textContent!.trim()))
      .toEqual(['Four']);
  });

  it('transmet l\'étiquette touchée', () => {
    const el = rendre(rendreReglageMinuteur(7, null, ETIQUETTES));
    el.querySelectorAll<HTMLElement>('.mn-etiquette')[2].dispatchEvent(new Event('pointerdown'));
    expect(a.choisirEtiquette).toHaveBeenCalledWith('Riz');
  });

  it('démarre', () => {
    const el = rendre(rendreReglageMinuteur(7, null, ETIQUETTES));
    el.querySelector<HTMLElement>('[data-action="demarrer"]')!.dispatchEvent(new Event('pointerdown'));
    expect(a.demarrer).toHaveBeenCalled();
  });

  it('retire « − 5 » à la borne basse — jamais un bouton qui ne peut rien faire', () => {
    const el = rendre(rendreReglageMinuteur(1, null, ETIQUETTES));
    expect(el.querySelector('[data-action="moins"]')).toBeNull();
    expect(el.querySelector('[data-action="plus"]')).not.toBeNull();
  });

  it('retire « + 5 » à la borne haute', () => {
    const el = rendre(rendreReglageMinuteur(120, null, ETIQUETTES));
    expect(el.querySelector('[data-action="plus"]')).toBeNull();
    expect(el.querySelector('[data-action="moins"]')).not.toBeNull();
  });

  it('n\'affiche aucune étiquette quand la pièce n\'en déclare pas', () => {
    const el = rendre(rendreReglageMinuteur(7, null, []));
    expect(el.querySelectorAll('.mn-etiquette')).toHaveLength(0);
    expect(el.querySelector('[data-action="demarrer"]')).not.toBeNull();
  });

  // Tâche 10 bis : le réglage est devenu une sous-vue plein écran — le bouton « Retour », sur le
  // patron exact de `rendu/maison.ts`/`rendu/taches.ts` (`.xl`), appelle `actions.fermer()`.
  it('ferme via le bouton Retour', () => {
    const el = rendre(rendreReglageMinuteur(7, null, ETIQUETTES));
    const retour = el.querySelector<HTMLElement>('.xl')!;
    expect(retour.textContent).toContain('Retour');
    retour.dispatchEvent(new Event('pointerdown'));
    expect(a.fermer).toHaveBeenCalled();
  });
});

describe('ecrireTemps', () => {
  it('mute le nœud texte rendu par lit, sans détruire son marqueur', () => {
    const el = document.createElement('div');
    render(rendreMinuteurs([vue({ restantS: 300 })], true), el);
    const span = el.querySelector<HTMLElement>('.mn-temps')!;
    const avant = span.childNodes.length;
    ecrireTemps(span, '04:59');
    expect(span.textContent).toBe('04:59');
    expect(span.childNodes.length).toBe(avant);
    // Le rendu suivant ne doit pas lever : c'est exactement le défaut du 2026-08-03.
    expect(() => render(rendreMinuteurs([vue({ restantS: 298 })], true), el)).not.toThrow();
    expect(el.querySelector('.mn-temps')!.textContent).toBe('04:58');
  });
});

// Ronde de correction 1 (arbitrage du propriétaire, 2026-08-03) : la tuile minuteur SATURÉE
// (`.ambiance.inactif`) ne doit RIEN accuser au contact — son `pointerdown` ne déclenche jamais
// `ouvrir()` (cf. le test « n'ouvre rien... » ci-dessus), donc un accusé de réception y mentirait.
// jsdom ne déclenche jamais réellement `:active` (aucun moteur de mise en page derrière), donc ce
// contrôle se fait en lisant `base.css`, comme les tests de gabarit CSS de `tests/corps.test.ts`.
describe('.ambiance.inactif — aucun accusé de réception au contact (tuile minuteur saturée)', () => {
  function regleCss(selecteurEchappe: string): string {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    const m = css.match(new RegExp(`${selecteurEchappe}\\s*\\{([^}]*)\\}`));
    if (!m) throw new Error(`règle ${selecteurEchappe} introuvable dans base.css`);
    return m[1];
  }

  it('supprime la génération de la couche ::after héritée de .ambiance, pas seulement son opacité', () => {
    const regle = regleCss('\\.ambiance\\.inactif::after');
    expect(regle.match(/content:\s*([^;]+);/)?.[1]?.trim()).toBe('none');
  });

  it('ne resserre plus le rayon d\'angle au contact, dans les trois positions possibles', () => {
    expect(regleCss('\\.ambiance\\.inactif:active').match(/border-radius:\s*([^;]+);/)?.[1]?.trim())
      .toBe('var(--sh-s)');
    expect(regleCss('\\.ambiance\\.inactif:first-child:active')
      .match(/border-radius:\s*([^;]+);/)?.[1]?.trim())
      .toBe('var(--sh-xl) var(--sh-s) var(--sh-s) var(--sh-xl)');
    expect(regleCss('\\.ambiance\\.inactif:last-child:active')
      .match(/border-radius:\s*([^;]+);/)?.[1]?.trim())
      .toBe('var(--sh-s) var(--sh-xl) var(--sh-xl) var(--sh-s)');
  });
});

// Ronde de correction 1 (tâche 5) : à l'inverse de `.ambiance.inactif` ci-dessus, `.mn-etiquette`
// AGIT (vrai `@pointerdown` → `actions.choisirEtiquette`) — le re-rendu qui la fait passer en
// `.choisie` n'arrive qu'après le câblage de la tâche 7, donc sans accusé de réception au contact
// lui-même, rien ne bougerait sous le doigt entre l'appui et ce re-rendu. Même patron de lecture
// directe de `base.css` que ci-dessus (jsdom ne déclenche jamais réellement `:active`).
describe('.mn-etiquette — retour au contact au doigt (l\'étiquette agit, contrairement à la tuile saturée)', () => {
  function regleCss(selecteurEchappe: string): string {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    const m = css.match(new RegExp(`${selecteurEchappe}\\s*\\{([^}]*)\\}`));
    if (!m) throw new Error(`règle ${selecteurEchappe} introuvable dans base.css`);
    return m[1];
  }

  it('rejoint la couche `position: relative` du groupe .mn-bouton/.mn-nouveau', () => {
    expect(() => regleCss('\\.mn-bouton,\\s*\\.mn-nouveau,\\s*\\.mn-etiquette')).not.toThrow();
  });

  it('rejoint la couche `::after` (overlay masqué au repos) du groupe', () => {
    const regle = regleCss('\\.mn-bouton::after,\\s*\\.mn-nouveau::after,\\s*\\.mn-etiquette::after');
    expect(regle.match(/opacity:\s*([^;]+);/)?.[1]?.trim()).toBe('0');
  });

  it('rejoint la couche `:active::after` (opacité au contact) du groupe', () => {
    const regle = regleCss(
      '\\.mn-bouton:active::after,\\s*\\.mn-nouveau:active::after,\\s*\\.mn-etiquette:active::after');
    expect(regle.match(/opacity:\s*([^;]+);/)?.[1]?.trim()).toBe('.1');
  });
});
