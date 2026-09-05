// Tâche 13 : `jauge.ts` est un module de fonctions PURES (aucun DOM, aucun pointeur) — ce fichier
// prouve la décision « jauge ou pas » pour les quatre cas du brief (lumière, chauffage, rideau,
// média) et les cas limites explicitement demandés (« une entité muette ou qui ne supporte pas
// le réglage ne doit pas afficher de jauge »), puis la conversion position → valeur.
import { describe, it, expect } from 'vitest';
import { Etat } from '../src/etat';
import { descripteurJauge, valeurDepuisPosition, fractionJauge, type DescripteurJauge } from '../src/jauge';

const ev = (id: string, etat: string, attributes: Record<string, unknown> = {}) =>
  ({ entity_id: id, state: etat, attributes });

describe('descripteurJauge — lumières', () => {
  it('lumière allumée : valeur en pourcentage depuis brightness (0-255)', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'on', {
      brightness: 128, supported_color_modes: ['color_temp', 'hs', 'rgb'],
    }));
    const d = descripteurJauge('light.lumiere_salon', etat)!;
    expect(d).not.toBeNull();
    // 1 et non 0 : `brightness_pct: 0` éteint la lampe côté Home Assistant, ce qui faisait
    // clignoter la lumière pendant un glissement jusqu'au bord gauche.
    expect(d.min).toBe(1);
    expect(d.max).toBe(100);
    expect(d.valeur).toBe(Math.round((128 / 255) * 100));
  });

  // Règle explicite du brief : « une lumière éteinte n'a pas de luminosité — décide ce qu'affiche
  // la jauge dans ce cas ». Décision : jauge VIDE (0 %), jamais le dernier niveau connu.
  it('lumière éteinte : la jauge existe (0%), jamais le dernier niveau connu, jamais absente', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', {
      brightness: 200, supported_color_modes: ['color_temp', 'hs', 'rgb'],
    }));
    const d = descripteurJauge('light.lumiere_salon', etat);
    expect(d).not.toBeNull();
    expect(d!.valeur).toBe(0);
  });

  it('glisser sur une lumière éteinte reste utile : turn_on à la valeur choisie, jamais un geste mort', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['color_temp'] }));
    const d = descripteurJauge('light.lumiere_salon', etat)!;
    expect(d.appliquer(60)).toEqual(['light', 'turn_on', { brightness_pct: 60 }]);
  });

  it('une valeur de 0% éteint plutôt que d envoyer brightness_pct: 0', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'on', { brightness: 255, supported_color_modes: ['hs'] }));
    const d = descripteurJauge('light.lumiere_salon', etat)!;
    expect(d.appliquer(0)).toEqual(['light', 'turn_off', {}]);
  });

  // Règle 4 du brief : une entité qui ne supporte pas le réglage ne doit pas afficher de jauge.
  // Seul cas réel de lumière hors de portée : `supported_color_modes` limité à `['onoff']`.
  it('lumière strictement onoff (aucun mode couleur) : aucune jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.prise_simple', 'on', { supported_color_modes: ['onoff'] }));
    expect(descripteurJauge('light.prise_simple', etat)).toBeNull();
  });

  it('lumière muette/indisponible : aucune jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'unavailable'));
    expect(descripteurJauge('light.lumiere_salon', etat)).toBeNull();
  });
});

describe('descripteurJauge — chauffage (climate.radiateur)', () => {
  it('plage restreinte à 16-24°C par pas de 0,5°C, quelle que soit la plage native du device', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', { temperature: 21 }));
    const d = descripteurJauge('climate.radiateur', etat)!;
    expect(d.min).toBe(16);
    expect(d.max).toBe(24);
    expect(d.pas).toBe(0.5);
    expect(d.valeur).toBe(21);
  });

  // Les 3 préréglages réels doivent tomber DANS la plage utile (sauf le hors-gel, exclu à
  // dessein — cf. commentaire de `jauge.ts`).
  it.each([19, 21, 23])('le préréglage %s°C (éco/confort/boost) est dans la plage utile', (preset) => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', { temperature: preset }));
    const d = descripteurJauge('climate.radiateur', etat)!;
    expect(d.valeur).toBe(preset);
    expect(preset).toBeGreaterThanOrEqual(d.min);
    expect(preset).toBeLessThanOrEqual(d.max);
  });

  it('le hors-gel (7°C) est hors plage : affiché à l extrémité la plus proche, jamais hors cadre', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', { temperature: 7 }));
    const d = descripteurJauge('climate.radiateur', etat)!;
    expect(d.valeur).toBe(16);   // clampé au minimum de la plage utile
  });

  it('climate.radiateur (état off) reste réglable si une consigne existe : "off" n est pas "muet"', () => {
    // VersatileThermostat expose `temperature` même hors chauffe (contrairement à un état
    // unavailable/unknown, seuls cas exclus par `estUtilisable`).
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'off', { temperature: 19 }));
    expect(descripteurJauge('climate.radiateur', etat)).not.toBeNull();
  });

  it('sans consigne exploitable (attribut temperature absent) : aucune jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', {}));
    expect(descripteurJauge('climate.radiateur', etat)).toBeNull();
  });

  it('produit bien un appel set_temperature', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', { temperature: 19 }));
    const d = descripteurJauge('climate.radiateur', etat)!;
    expect(d.appliquer(22.5)).toEqual(['climate', 'set_temperature', { temperature: 22.5 }]);
  });
});

describe('descripteurJauge — rideaux (cover)', () => {
  it('cover.rideau_salon à 87%, supported_features=15 (inclut SET_POSITION=4) : jauge présente', () => {
    const etat = new Etat();
    etat.appliquer(ev('cover.rideau_salon', 'open', { current_position: 87, supported_features: 15 }));
    const d = descripteurJauge('cover.rideau_salon', etat)!;
    expect(d).not.toBeNull();
    expect(d.valeur).toBe(87);
    expect(d.min).toBe(0);
    expect(d.max).toBe(100);
  });

  it('produit bien un appel set_cover_position', () => {
    const etat = new Etat();
    etat.appliquer(ev('cover.rideau_cuisine', 'closed', { current_position: 0, supported_features: 15 }));
    const d = descripteurJauge('cover.rideau_cuisine', etat)!;
    expect(d.appliquer(42)).toEqual(['cover', 'set_cover_position', { position: 42 }]);
  });

  // Règle 4 : un volet qui ne supporte pas SET_POSITION (bit 4 absent du masque) n affiche rien.
  it('volet SANS SET_POSITION (bit 4 absent du masque) : aucune jauge, même avec une position lisible', () => {
    const etat = new Etat();
    // OPEN(1) + CLOSE(2) + STOP(8) = 11, sans SET_POSITION(4).
    etat.appliquer(ev('cover.rideau_salon', 'open', { current_position: 50, supported_features: 11 }));
    expect(descripteurJauge('cover.rideau_salon', etat)).toBeNull();
  });

  it('volet sans attribut current_position exploitable : aucune jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('cover.rideau_salon', 'open', { supported_features: 15 }));
    expect(descripteurJauge('cover.rideau_salon', etat)).toBeNull();
  });
});

describe('descripteurJauge — média (volume)', () => {
  it('ne rend plus jamais de jauge pour un media_player', () => {
    // Tâche 6 (2026-08-02) : la carte média porte maintenant trois boutons ; un glissement qui
    // les traverse serait une collision d'intentions. Le volume a son propre contrôle.
    const etat = new Etat();
    etat.appliquer({ entity_id: 'media_player.x', state: 'playing',
                     attributes: { volume_level: 0.5, supported_features: 4 } });
    expect(descripteurJauge('media_player.x', etat)).toBeNull();
  });
});

describe('descripteurJauge — domaines sans jauge', () => {
  it.each(['lock.aqara_smart_lock_u200_lite', 'vacuum.aspirateur_cuisine', 'scene.salon_clair', 'todo.maintenance'])(
    '%s n a jamais de jauge, quel que soit son état', (id) => {
      const etat = new Etat();
      etat.appliquer(ev(id, 'on', { current_position: 50, volume_level: 0.5, temperature: 20 }));
      expect(descripteurJauge(id, etat)).toBeNull();
    });

  it('entité totalement absente : aucune jauge, jamais une exception', () => {
    const etat = new Etat();
    expect(() => descripteurJauge('light.jamais_vu', etat)).not.toThrow();
    expect(descripteurJauge('light.jamais_vu', etat)).toBeNull();
  });
});

describe('valeurDepuisPosition', () => {
  const d: DescripteurJauge = { valeur: 50, min: 0, max: 100, pas: 1, appliquer: () => ['x', 'y', {}] };

  it('mi-largeur -> valeur médiane', () => {
    expect(valeurDepuisPosition(d, 80, 160)).toBe(50);
  });
  it('bord gauche -> min, bord droit -> max', () => {
    expect(valeurDepuisPosition(d, 0, 160)).toBe(0);
    expect(valeurDepuisPosition(d, 160, 160)).toBe(100);
  });
  it('clampe au-delà des bords (doigt sorti par capture de pointeur)', () => {
    expect(valeurDepuisPosition(d, -50, 160)).toBe(0);
    expect(valeurDepuisPosition(d, 500, 160)).toBe(100);
  });
  it('largeur nulle ou négative (tuile non mise en page, ex. jsdom) : renvoie la valeur actuelle', () => {
    expect(valeurDepuisPosition(d, 80, 0)).toBe(50);
    expect(valeurDepuisPosition(d, 80, -10)).toBe(50);
  });

  it('pas de 0,5°C : arrondit sans dérive flottante (0.1+0.2 !== 0.3 en JS)', () => {
    const chauffage: DescripteurJauge = { valeur: 20, min: 16, max: 24, pas: 0.5, appliquer: () => ['x', 'y', {}] };
    // 16 + (17/160)*8 = 16.85 -> arrondi au pas 0,5 le plus proche = 17.
    const v = valeurDepuisPosition(chauffage, 17, 160);
    expect(v).toBe(17);
    expect(String(v)).not.toMatch(/\.\d{2,}/);   // jamais 16.999999999999998 ou équivalent
  });

  it('respecte le pas exact (24 crans possibles sur 16-24 par pas de 0,5)', () => {
    const chauffage: DescripteurJauge = { valeur: 16, min: 16, max: 24, pas: 0.5, appliquer: () => ['x', 'y', {}] };
    expect(valeurDepuisPosition(chauffage, 80, 160)).toBe(20);   // mi-largeur = mi-plage = 20°C
  });
});

describe('fractionJauge', () => {
  it('0% au minimum, 100% au maximum, 50% au milieu', () => {
    expect(fractionJauge({ valeur: 0, min: 0, max: 100 })).toBe(0);
    expect(fractionJauge({ valeur: 100, min: 0, max: 100 })).toBe(1);
    expect(fractionJauge({ valeur: 50, min: 0, max: 100 })).toBe(0.5);
  });
  it('plage nulle (min === max) : 0, jamais une division par zéro (NaN/Infinity)', () => {
    expect(fractionJauge({ valeur: 5, min: 5, max: 5 })).toBe(0);
  });

  // Défaut mineur de la revue de rattrapage : `fractionJauge` borne son résultat à [0, 1] parce
  // qu'une valeur RÉELLE peut sortir de la plage RÉGLABLE — deux cas concrets de ce parc, jamais
  // exercés jusqu'ici. Sans ce bornage, le remplissage (`--jauge`, `base.css`) deviendrait négatif
  // ou dépasserait 100 %.
  it('borne à [0, 1] : une valeur réelle peut sortir de la plage réglable', () => {
    // Lampe éteinte (valeur 0) alors que le minimum réglable est 1, cf. `descripteurLumiere`.
    expect(fractionJauge({ valeur: 0, min: 1, max: 100 })).toBe(0);
    // Consigne de hors-gel à 7 °C, sous la plage réglable 16-24 °C, cf. `descripteurChauffage`.
    expect(fractionJauge({ valeur: 7, min: 16, max: 24 })).toBe(0);
    // Symétriquement côté haut : une valeur au-dessus du maximum ne doit jamais dépasser 1.
    expect(fractionJauge({ valeur: 150, min: 0, max: 100 })).toBe(1);
  });
});
