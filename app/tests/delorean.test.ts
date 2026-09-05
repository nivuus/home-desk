// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'lit';
import {
  estInstantDelorean, varianteDelorean, rendreDelorean, vitesseDelorean, DUREES_DELOREAN,
} from '../src/rendu/delorean';

describe('varianteDelorean', () => {
  it('la foudre à 22 h 04', () => {
    expect(varianteDelorean(new Date('2026-03-15T22:04:00'))).toBe('foudre');
  });

  it('le voyage à 01 h 21', () => {
    expect(varianteDelorean(new Date('2026-03-15T01:21:00'))).toBe('voyage');
  });

  it('le saut complet toute la journée du 21 octobre', () => {
    expect(varianteDelorean(new Date('2026-10-21T14:37:00'))).toBe('saut');
  });

  it('le saut complet toute la journée du 5 novembre', () => {
    expect(varianteDelorean(new Date('2026-11-05T08:00:00'))).toBe('saut');
  });

  it('le saut prime sur le rendez-vous quotidien un 21 octobre à 22 h 04', () => {
    expect(varianteDelorean(new Date('2026-10-21T22:04:00'))).toBe('saut');
  });

  it('rien une minute avant ou après un rendez-vous', () => {
    expect(varianteDelorean(new Date('2026-03-15T22:03:00'))).toBeNull();
    expect(varianteDelorean(new Date('2026-03-15T22:05:00'))).toBeNull();
    expect(varianteDelorean(new Date('2026-03-15T01:20:00'))).toBeNull();
    expect(varianteDelorean(new Date('2026-03-15T01:22:00'))).toBeNull();
  });

  it('rien la veille ni le lendemain des deux grandes dates', () => {
    expect(varianteDelorean(new Date('2026-10-20T14:37:00'))).toBeNull();
    expect(varianteDelorean(new Date('2026-10-22T14:37:00'))).toBeNull();
    expect(varianteDelorean(new Date('2026-11-04T08:00:00'))).toBeNull();
    expect(varianteDelorean(new Date('2026-11-06T08:00:00'))).toBeNull();
  });

  it('rien un jour ordinaire à une heure ordinaire', () => {
    expect(varianteDelorean(new Date('2026-08-02T19:59:00'))).toBeNull();
  });
});

describe('estInstantDelorean', () => {
  it('suit varianteDelorean', () => {
    expect(estInstantDelorean(new Date('2026-03-15T22:04:00'))).toBe(true);
    expect(estInstantDelorean(new Date('2026-10-21T14:37:00'))).toBe(true);
    expect(estInstantDelorean(new Date('2026-08-02T19:59:00'))).toBe(false);
  });
});

describe('vitesseDelorean', () => {
  it('part de zéro', () => {
    expect(vitesseDelorean(0)).toBe(0);
  });

  it('atteint 88 et n\'y va qu\'une fois', () => {
    expect(vitesseDelorean(3_100)).toBe(88);
    expect(vitesseDelorean(10_000)).toBe(88);
  });

  it('ne dépasse jamais 88, même sur une valeur absurde', () => {
    expect(vitesseDelorean(-500)).toBe(0);
    expect(vitesseDelorean(Number.MAX_SAFE_INTEGER)).toBe(88);
  });

  it('monte sans jamais redescendre', () => {
    let precedente = -1;
    for (let t = 0; t <= 3_100; t += 100) {
      const v = vitesseDelorean(t);
      expect(v).toBeGreaterThanOrEqual(precedente);
      precedente = v;
    }
  });

  it('ralentit sur la fin : les derniers mph se font attendre', () => {
    // La première moitié du temps couvre beaucoup plus de terrain que la seconde — c'est la
    // sensation recherchée, et c'est ce qui distingue cette courbe d'une montée linéaire.
    const moitie = vitesseDelorean(1_550);
    expect(moitie).toBeGreaterThan(44);
    expect(moitie).toBeLessThan(88);
  });
});

describe('rendreDelorean', () => {
  let hote: HTMLElement;
  beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

  it('rend un survol qui ne contient aucune commande', () => {
    for (const scene of ['foudre', 'voyage', 'saut'] as const) {
      render(rendreDelorean(scene), hote);
      const survol = hote.querySelector('.delorean')!;
      expect(survol).not.toBeNull();
      // Il PASSE PAR-DESSUS puis s'efface : il ne doit voler aucun contact ni remplacer une action.
      expect(survol.querySelectorAll('.commande, .xl, .media-bouton').length).toBe(0);
    }
  });

  it('porte sa durée en propriété CSS, celle-là même que le voile utilise', () => {
    for (const scene of ['foudre', 'voyage', 'saut'] as const) {
      render(rendreDelorean(scene), hote);
      const style = hote.querySelector('.delorean')!.getAttribute('style')!;
      expect(style).toContain(`--delorean-duree:${DUREES_DELOREAN[scene]}ms`);
    }
  });

  it('chaque scène porte son voile et son flash de coupe', () => {
    for (const scene of ['foudre', 'voyage', 'saut'] as const) {
      render(rendreDelorean(scene), hote);
      expect(hote.querySelector('.delorean-voile')).not.toBeNull();
      expect(hote.querySelector('.delorean-coupe')).not.toBeNull();
    }
  });

  it('la foudre montre l\'éclair, et lui seul', () => {
    render(rendreDelorean('foudre'), hote);
    expect(hote.querySelector('.delorean-eclair')).not.toBeNull();
    expect(hote.querySelector('.delorean-feu')).toBeNull();
    expect(hote.querySelector('.delorean-flux')).toBeNull();
  });

  it('le voyage affiche la vitesse qu\'on lui donne', () => {
    render(rendreDelorean('voyage', 42), hote);
    expect(hote.querySelector('.delorean-nombre')!.textContent).toBe('42');
    expect(hote.querySelector('.delorean-unite')!.textContent).toBe('MPH');
    render(rendreDelorean('voyage', 88), hote);
    expect(hote.querySelector('.delorean-nombre')!.textContent).toBe('88');
  });

  it('le voyage plaque la traînée de feu et ne montre aucun cadran', () => {
    render(rendreDelorean('voyage'), hote);
    expect(hote.querySelector('.delorean-feu')).not.toBeNull();
    expect(hote.querySelectorAll('.delorean-rangee').length).toBe(0);
  });

  it('le saut montre le flux capacitor et trois cadrans figés sur le film', () => {
    render(rendreDelorean('saut'), hote);
    expect(hote.querySelector('.delorean-flux')).not.toBeNull();
    const rangees = hote.querySelectorAll('.delorean-rangee');
    expect(rangees.length).toBe(3);
    const etiquettes = Array.prototype.slice.call(rangees)
      .map((r: Element) => r.querySelector('.delorean-etiquette')!.textContent);
    expect(etiquettes).toEqual(['DESTINATION TIME', 'PRESENT TIME', 'LAST TIME DEPARTED']);
    // Aucune date réelle : le texte affiché est écrit en dur, donc il ne contient jamais
    // l'année courante — c'est justement ce qui permet à la scène de survivre à une coupure.
    const annees = Array.prototype.slice.call(hote.querySelectorAll('.delorean-num[data-fantome="8888"]'))
      .map((e: Element) => e.textContent);
    expect(annees.every((a: string) => ['2015', '1985', '1955'].includes(a))).toBe(true);
  });

  it('chaque groupe de chiffres porte ses segments éteints', () => {
    render(rendreDelorean('saut'), hote);
    const fantomes = Array.prototype.slice.call(hote.querySelectorAll('.delorean-num'))
      .map((e: Element) => e.getAttribute('data-fantome'));
    expect(fantomes).toEqual(['88', '8888', '88:88', '88', '8888', '88:88', '88', '8888', '88:88']);
  });
});
