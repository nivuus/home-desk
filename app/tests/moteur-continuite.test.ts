// @vitest-environment jsdom
/** Continuity of the motion engine (2026-11-06): the gestures filmed frame by frame on the
 *  deployed tablets that flickered or jumped — the digit roll overflowing its glyph, the view
 *  slide overshooting the edge, and the swiped card coming back in the middle of the stack. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { creerMoteur, type OptionsMoteur } from '../src/mouvement/moteur';
import { VIEW_EASING } from '../src/mouvement/grammaire';
import { attachSwipe } from '../src/stack/swipe';

afterEach(() => { document.body.innerHTML = ''; });

function moteurDeTest(surcharges: Partial<OptionsMoteur> = {}) {
  const racine = document.createElement('div');
  document.body.appendChild(racine);
  const appels: { el: HTMLElement; trames: any; options: any }[] = [];
  const moteur = creerMoteur(racine, {
    rendre: (gabarit) => {
      const calques = Array.from(racine.querySelectorAll('#mvt-fantomes, #mvt-fond'));
      racine.innerHTML = String(gabarit);
      for (const c of calques) racine.appendChild(c);
    },
    positionDe: () => [0, 0] as const,
    tailleDe: () => [10, 10] as const,
    animer: (el, trames, options) => {
      appels.push({ el, trames, options });
      return { finished: new Promise(() => {}), cancel: () => {} } as any;
    },
    estMasquee: () => false,
    niveauInitial: 'complet',
    ...surcharges,
  });
  return { racine, moteur, appels };
}

describe('roulement de chiffres découpé à la boîte du glyphe', () => {
  it('l\'ancien et le nouveau chiffre sont rognés au fil de leur translation', () => {
    const { moteur, appels } = moteurDeTest();
    moteur.peindre('<span data-mvt="chiffre:4" data-mvt-etat="9">9</span>');
    moteur.peindre('<span data-mvt="chiffre:4" data-mvt-etat="0">0</span>');
    const sortant = appels.find((x) => x.el.parentElement?.id === 'mvt-fantomes')!;
    const entrant = appels.find((x) => x !== sortant)!;
    // Leaving upwards, only its part still inside the box shows: clipped from the top.
    expect(sortant.trames.map((t: Keyframe) => t.clipPath))
      .toEqual(['inset(0 0 0 0)', 'inset(100% 0 0 0)']);
    // Coming from below, clipped from the bottom until it is in place.
    expect(entrant.trames.map((t: Keyframe) => t.clipPath))
      .toEqual(['inset(0 0 100% 0)', 'inset(0 0 0 0)']);
    // A spring past its target would push the glyph out of its own clip.
    expect(entrant.options.easing).not.toContain('1.5');
  });
});

describe('traversée de vue sans dépassement', () => {
  it('la vue entrante décélère jusqu\'à sa place sans jamais la dépasser', () => {
    const { moteur, appels } = moteurDeTest();
    moteur.peindre('<div data-mvt="vue:accueil"></div>');
    moteur.peindre('<div data-mvt="vue:maison"></div>');
    expect(appels).toHaveLength(1);
    expect(appels[0].options.easing).toBe(VIEW_EASING);
    // A cubic-bezier never leaves [0, 1] when both its control ordinates stay inside it.
    const ordonnees = /cubic-bezier\(([^)]*)\)/.exec(VIEW_EASING)![1].split(',').map(Number);
    expect([ordonnees[1], ordonnees[3]].every((y) => y >= 0 && y <= 1)).toBe(true);
  });
});

describe('carte emportée par le glissé', () => {
  const pile = (cle: string) =>
    `<div class="pile"><section data-mvt="bloc:${cle}"><div data-mvt="detail:${cle}-x"></div></section></div>`;

  it('la carte qui part suit le doigt hors de l\'écran, et la peinture suivante ne croise rien dedans', () => {
    const { racine, moteur, appels } = moteurDeTest();
    moteur.peindre(pile('media'));
    const el = racine.querySelector<HTMLElement>('.pile')!;
    el.style.transform = 'translateX(-200px)';
    // jsdom lays nothing out: the box the finger left the card in, 200 px to the left.
    el.getBoundingClientRect = () => ({ left: -184, right: 127, top: 205, bottom: 469,
      width: 311, height: 264 }) as DOMRect;
    moteur.carryOff(el, -1, 180);
    // The clone keeps no transform of its own: its box is where the finger left the card.
    const parti = appels[0];
    expect(parti.el.parentElement?.id).toBe('mvt-fantomes');
    expect(parti.el.style.transform).toBe('');
    expect(parti.el.style.left).toBe('-184px');
    expect(parti.trames[1].transform).toBe('translateX(-127px)');   // its right edge to the screen's left
    expect(parti.options.duration).toBe(180);

    moteur.peindre(pile('garde-manger'));
    expect(appels).toHaveLength(1);              // no crossing, no ghost of the volume buttons

    // One painting only: the next change is the engine's again.
    moteur.peindre(pile('voiture'));
    expect(appels.length).toBeGreaterThan(1);
  });

  it('le glissé annonce la carte qui part AVANT de relâcher son décalage', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const vus: string[] = [];
    const onLeave = vi.fn(() => vus.push(el.style.transform));
    const onChange = vi.fn();
    attachSwipe(el, { count: 2, index: 0, onChange, onTouch: () => {}, onLeave },
      ((cb: () => void, ms: number) => setTimeout(cb, ms)) as any);
    const ev = (type: string, x: number) => {
      const e = new Event(type, { bubbles: true }) as any;
      e.pointerId = 1; e.clientX = x; e.clientY = 10;
      el.dispatchEvent(e);
    };
    ev('pointerdown', 200);
    ev('pointermove', 100);
    ev('pointerup', 100);
    expect(onLeave).toHaveBeenCalledWith(-1);
    expect(vus[0]).toBe('translateX(-100px)');
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('un glissé qui revient à sa place n\'emporte rien', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const onLeave = vi.fn();
    attachSwipe(el, { count: 2, index: 0, onChange: () => {}, onTouch: () => {}, onLeave },
      ((cb: () => void, ms: number) => setTimeout(cb, ms)) as any);
    const ev = (type: string, x: number) => {
      const e = new Event(type, { bubbles: true }) as any;
      e.pointerId = 1; e.clientX = x; e.clientY = 10;
      el.dispatchEvent(e);
    };
    ev('pointerdown', 200);
    ev('pointermove', 150);
    ev('pointermove', 198);
    ev('pointerup', 198);
    expect(onLeave).not.toHaveBeenCalled();
  });
});

import { html } from 'lit';
import { shownState, type CardFrame } from '../src/rendu/card-frame';
import { frame as timerFrame } from '../src/cards/timer';
import { frameWith, screenWith, running } from './card-aides';

describe('fondu croisé sur demande (data-mvt-swap)', () => {
  it('une ligne qui le demande croise son texte ; sans la demande, rien ne joue', () => {
    const { moteur, appels } = moteurDeTest();
    moteur.peindre('<div data-mvt="ligne:synthese" data-mvt-swap data-mvt-etat="a">rideau ouvert</div>'
      + '<div data-mvt="ligne:t1" data-mvt-etat="repos"></div>');
    moteur.peindre('<div data-mvt="ligne:synthese" data-mvt-swap data-mvt-etat="b">tout est fermé</div>'
      + '<div data-mvt="ligne:t1" data-mvt-etat="armee"></div>');
    expect(appels).toHaveLength(1);
    expect(appels[0].el.textContent).toBe('rideau ouvert');
    expect(appels[0].trames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });

  // A card button takes its disc colour from custom properties set on the card: reparented under
  // the ghost layer, its clone would lose them.
  it('le fantôme garde les couleurs résolues de l\'élément, qu\'il perdrait hors de ses ancêtres', () => {
    const { racine, moteur, appels } = moteurDeTest();
    racine.style.setProperty('--disque', 'rgb(1, 2, 3)');
    moteur.peindre('<div data-mvt="detail:tr-middle" data-mvt-swap data-mvt-etat="pause" '
      + 'style="background-color: var(--disque); color: rgb(4, 5, 6)">II</div>');
    moteur.peindre('<div data-mvt="detail:tr-middle" data-mvt-swap data-mvt-etat="lecture" '
      + 'style="background-color: var(--disque); color: rgb(4, 5, 6)">▶</div>');
    const fantome = appels[0].el;
    expect(fantome.textContent).toBe('II');
    expect(fantome.style.color).toBe('rgb(4, 5, 6)');
  });
});

describe('état de mouvement des cartes', () => {
  const carte = (km: string, act = () => {}): CardFrame => ({
    key: 'voiture', label: 'Voiture', title: '85 %', middle: html`<b>${km}</b> km`,
    buttons: [{ icon: 'clim', label: 'Clim', act }, undefined, undefined],
    background: { kind: 'solid', token: 'neutral' }, motion: { block: 'bloc:voiture' },
  });

  it('change avec ce que la carte montre, jamais avec ses gestionnaires', () => {
    expect(shownState(carte('250'))).not.toBe(shownState(carte('248')));
    expect(shownState(carte('250', () => 1))).toBe(shownState(carte('250', () => 2)));
  });

  it('le minuteur nomme le sien, sans son décompte : chaque seconde rejouerait le fondu', () => {
    const card = { key: 'minuteur:timer.cuisine', type: 'minuteur', rank: 1 } as const;
    const a = timerFrame(card, frameWith({ timers: [running('timer.cuisine', 300)] }), screenWith());
    const b = timerFrame(card, frameWith({ timers: [running('timer.cuisine', 299)] }), screenWith());
    expect(a.motion?.state).toBeDefined();
    expect(a.motion?.state).toBe(b.motion?.state);
  });
});
