// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  tuileMinuteur, brancherMinuteur, writeTime, rendreReglageMinuteur, type ActionsMinuteur,
} from '../src/rendu/minuteur';
import type { VueMinuteur } from '../src/minuteur';
import { frame as timerFrame } from '../src/cards/timer';
import { renderCardFrame } from '../src/rendu/card-frame';
import { frameWith, screenWith } from './card-aides';

function actions(): ActionsMinuteur & Record<string, ReturnType<typeof vi.fn>> {
  return {
    ouvrir: vi.fn(), fermer: vi.fn(), changerDuree: vi.fn(), choisirEtiquette: vi.fn(),
    start: vi.fn(), pause: vi.fn(), reprendre: vi.fn(), annuler: vi.fn(), ajuster: vi.fn(),
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

// Tâche 7 (mouvement, 2026-08-22) : couverture — chaque forme (solo, liste, réglage) et ses
// éléments qui apparaissent/disparaissent (étiquettes, bouton « Démarrer »/« Nouveau », pas ±5)
// portent une marque, pour que le moteur (`src/mouvement/moteur.ts`) les anime plutôt que de les
// faire sauter sec.
// Card-stack task 6: the solo and list timer blocks (`rendreMinuteurs`) left with the timer
// mode; the timer card replaces them (`tests/card-timer.test.ts`, `tests/home-stack.test.ts`).
// The setting screen keeps its marks.
describe('marques de mouvement', () => {
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

  // Under a card the Ambiance row drops: the tile becomes a place of the controls grid.
  it('drawn in the controls grid: a control, same entry and mark', () => {
    const el = rendre(tuileMinuteur(false, true));
    const tuile = el.querySelector<HTMLElement>('.commande.tuile-minuteur')!;
    expect(tuile.hasAttribute('data-minuteur-entree')).toBe(true);
    expect(tuile.getAttribute('data-mvt')).toBe('tuile:minuteur');
    tuile.dispatchEvent(new Event('pointerdown'));
    expect(a.ouvrir).toHaveBeenCalled();
  });

  it('saturated in the grid: opens nothing and is an inert control, no feedback', () => {
    const el = rendre(tuileMinuteur(true, true));
    const tuile = el.querySelector<HTMLElement>('.commande.tuile-minuteur')!;
    tuile.dispatchEvent(new Event('pointerdown'));
    expect(a.ouvrir).not.toHaveBeenCalled();
    expect(tuile.classList.contains('inerte')).toBe(true);
  });
});

describe('rendreReglageMinuteur', () => {
  const ETIQUETTES = ['Pâtes', 'Four', 'Riz', 'Œufs', 'Thé'];

  it('shows the duration in minutes and the four steps', () => {
    const el = rendre(rendreReglageMinuteur(7, null, ETIQUETTES));
    expect(el.querySelector('.mn-duree')!.textContent).toContain('7 min');
    for (const action of ['moins', 'moins1', 'plus1', 'plus']) {
      el.querySelector<HTMLElement>(`[data-action="${action}"]`)!
        .dispatchEvent(new Event('pointerdown'));
    }
    expect(vi.mocked(a.changerDuree).mock.calls).toEqual([[-5], [-1], [1], [5]]);
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
    expect(a.start).toHaveBeenCalled();
  });

  it('removes − 5 and − 1 at the lower bound — never a button that can do nothing', () => {
    const el = rendre(rendreReglageMinuteur(1, null, ETIQUETTES));
    expect(el.querySelector('[data-action="moins"]')).toBeNull();
    expect(el.querySelector('[data-action="moins1"]')).toBeNull();
    expect(el.querySelector('[data-action="plus1"]')).not.toBeNull();
    expect(el.querySelector('[data-action="plus"]')).not.toBeNull();
  });

  it('removes + 1 and + 5 at the upper bound', () => {
    const el = rendre(rendreReglageMinuteur(120, null, ETIQUETTES));
    expect(el.querySelector('[data-action="plus"]')).toBeNull();
    expect(el.querySelector('[data-action="plus1"]')).toBeNull();
    expect(el.querySelector('[data-action="moins1"]')).not.toBeNull();
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

describe('writeTime', () => {
  /** The timer card, the one countdown left on screen (card-stack task 6). */
  const carte = (restantS: number) => {
    const card = { key: 'minuteur:timer.cuisine', type: 'minuteur', rank: 1 } as const;
    return renderCardFrame(timerFrame(card, frameWith({ timers: [vue({ restantS })] }), screenWith()));
  };

  it('ne pose jamais data-mvt sur un temps — le rôle chiffre du moteur ne doit pas y toucher', () => {
    expect(rendre(carte(300)).querySelector('.mn-temps')!.hasAttribute('data-mvt')).toBe(false);
  });

  it('mute le nœud texte rendu par lit, sans détruire son marqueur', () => {
    const el = document.createElement('div');
    render(carte(300), el);
    const span = el.querySelector<HTMLElement>('.mn-temps')!;
    const avant = span.childNodes.length;
    writeTime(span, '04:59');
    expect(span.textContent).toBe('04:59');
    expect(span.childNodes.length).toBe(avant);
    // Le rendu suivant ne doit pas lever : c'est exactement le défaut du 2026-08-03.
    expect(() => render(carte(298), el)).not.toThrow();
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
