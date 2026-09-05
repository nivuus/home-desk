import { describe, it, expect } from 'vitest';
import { Etat } from '../src/etat';
import {
  lireDureeHms, listerMinuteurs, premierSlotLibre, bornerDuree, formaterRestant,
  ancrerMinuteur, restantAncre, hms, dureeHms, PAS_MINUTEUR_S, MAX_MINUTEURS,
  type SlotMinuteur,
} from '../src/minuteur';

const SLOTS: SlotMinuteur[] = [
  { timer: 'timer.cuisine', nom: 'input_text.minuteur_cuisine_nom' },
  { timer: 'timer.cuisine_2', nom: 'input_text.minuteur_cuisine_2_nom' },
  { timer: 'timer.cuisine_3', nom: 'input_text.minuteur_cuisine_3_nom' },
];

/** `maintenant` fixe : toutes les échéances du fichier s'y rapportent. */
const MAINTENANT = new Date('2026-08-03T12:00:00+02:00').getTime();

function etatAvec(entrees: [string, string, Record<string, unknown>?][]): Etat {
  const etat = new Etat();
  for (const [id, valeur, attributs] of entrees) {
    etat.appliquer({ entity_id: id, state: valeur, attributes: attributs ?? {} });
  }
  return etat;
}

function actif(secondes: number): Record<string, unknown> {
  return { finishes_at: new Date(MAINTENANT + secondes * 1000).toISOString() };
}

describe('lireDureeHms', () => {
  it('lit le format H:MM:SS de Home Assistant', () => {
    expect(lireDureeHms('0:08:00')).toBe(480);
    expect(lireDureeHms('1:02:03')).toBe(3723);
  });

  it('rend 0 sur une valeur inutilisable plutôt que NaN', () => {
    expect(lireDureeHms('')).toBe(0);
    expect(lireDureeHms('inconnu')).toBe(0);
  });
});

describe('listerMinuteurs', () => {
  it('ignore les minuteurs au repos', () => {
    const etat = etatAvec([
      ['timer.cuisine', 'idle', {}],
      ['timer.cuisine_2', 'idle', {}],
      ['timer.cuisine_3', 'idle', {}],
    ]);
    expect(listerMinuteurs(etat, SLOTS, MAINTENANT)).toEqual([]);
  });

  it('trie les actifs par échéance croissante, puis les pausés', () => {
    const etat = etatAvec([
      ['timer.cuisine', 'active', actif(600)],
      ['timer.cuisine_2', 'paused', { remaining: '0:01:00' }],
      ['timer.cuisine_3', 'active', actif(120)],
    ]);
    const vues = listerMinuteurs(etat, SLOTS, MAINTENANT);
    expect(vues.map((v) => v.timer)).toEqual(['timer.cuisine_3', 'timer.cuisine', 'timer.cuisine_2']);
    expect(vues.map((v) => v.actif)).toEqual([true, true, false]);
    expect(vues.map((v) => Math.round(v.restantS))).toEqual([120, 600, 60]);
  });

  it('lit le nom quand il est renseigné, et rend une chaîne vide sinon', () => {
    const etat = etatAvec([
      ['timer.cuisine', 'active', actif(60)],
      ['input_text.minuteur_cuisine_nom', 'Pâtes', {}],
      ['timer.cuisine_2', 'active', actif(90)],
      ['input_text.minuteur_cuisine_2_nom', '', {}],
    ]);
    const vues = listerMinuteurs(etat, SLOTS, MAINTENANT);
    expect(vues[0].nom).toBe('Pâtes');
    expect(vues[1].nom).toBe('');
  });

  it('ne rend jamais un temps négatif quand l\'échéance est dépassée', () => {
    const etat = etatAvec([['timer.cuisine', 'active', actif(-30)]]);
    expect(listerMinuteurs(etat, SLOTS, MAINTENANT)[0].restantS).toBe(0);
  });

  it('fait disparaître la ligne d\'un helper indisponible, jamais un temps inventé', () => {
    const etat = etatAvec([
      ['timer.cuisine', 'unavailable', {}],
      ['timer.cuisine_2', 'active', actif(60)],
    ]);
    expect(listerMinuteurs(etat, SLOTS, MAINTENANT).map((v) => v.timer)).toEqual(['timer.cuisine_2']);
  });

  it('garde un actif sans finishes_at, en se rabattant sur sa durée', () => {
    const etat = etatAvec([['timer.cuisine', 'active', { duration: '0:05:00' }]]);
    const vues = listerMinuteurs(etat, SLOTS, MAINTENANT);
    expect(vues).toHaveLength(1);
    expect(vues[0].restantS).toBe(300);
  });

  it('à égalité de temps restant, garde l\'ordre de déclaration des slots (tri stable)', () => {
    const etat = etatAvec([
      ['timer.cuisine', 'active', actif(120)],
      ['timer.cuisine_2', 'active', actif(120)],
      ['timer.cuisine_3', 'active', actif(120)],
    ]);
    const vues = listerMinuteurs(etat, SLOTS, MAINTENANT);
    expect(vues.map((v) => v.timer)).toEqual(['timer.cuisine', 'timer.cuisine_2', 'timer.cuisine_3']);
  });
});

describe('premierSlotLibre', () => {
  it('rend le premier slot au repos, même si un slot antérieur est pris', () => {
    const etat = etatAvec([
      ['timer.cuisine', 'active', actif(60)],
      ['timer.cuisine_2', 'idle', {}],
      ['timer.cuisine_3', 'idle', {}],
    ]);
    expect(premierSlotLibre(etat, SLOTS)).toBe(1);
  });

  it('rend null quand les trois sont pris', () => {
    const etat = etatAvec([
      ['timer.cuisine', 'active', actif(60)],
      ['timer.cuisine_2', 'paused', { remaining: '0:01:00' }],
      ['timer.cuisine_3', 'active', actif(30)],
    ]);
    expect(premierSlotLibre(etat, SLOTS)).toBeNull();
  });

  it('ne propose jamais un slot absent du registre, même quand c\'est le seul candidat restant', () => {
    // Les deux premiers slots sont réellement pris (active/paused) : sans la garde
    // `estUtilisable`, la boucle atteindrait forcément le 3e slot, jamais enregistré dans
    // `Etat` (`lire` rend `undefined`), et `etat.lire(...)!.etat` planterait au lieu de
    // rendre `null`. Avec la garde, ce slot est écarté avant la lecture.
    const etat = etatAvec([
      ['timer.cuisine', 'active', actif(60)],
      ['timer.cuisine_2', 'paused', { remaining: '0:01:00' }],
      // timer.cuisine_3 : jamais appliqué, absent du registre.
    ]);
    expect(() => premierSlotLibre(etat, SLOTS)).not.toThrow();
    expect(premierSlotLibre(etat, SLOTS)).toBeNull();
  });
});

describe('bornerDuree', () => {
  it('tient les bornes exactes', () => {
    expect(bornerDuree(1)).toBe(1);
    expect(bornerDuree(120)).toBe(120);
  });

  it('ramène dans les bornes', () => {
    expect(bornerDuree(0)).toBe(1);
    expect(bornerDuree(-5)).toBe(1);
    expect(bornerDuree(125)).toBe(120);
  });

  it('rend la borne basse sur une entrée non finie plutôt que NaN', () => {
    expect(bornerDuree(NaN)).toBe(1);
  });
});

describe('formaterRestant', () => {
  it('écrit mm:ss sous l\'heure', () => {
    expect(formaterRestant(0)).toBe('00:00');
    expect(formaterRestant(59)).toBe('00:59');
    expect(formaterRestant(600)).toBe('10:00');
    expect(formaterRestant(3599)).toBe('59:59');
  });

  it('écrit h:mm:ss à partir d\'une heure', () => {
    expect(formaterRestant(3600)).toBe('1:00:00');
    expect(formaterRestant(7325)).toBe('2:02:05');
  });

  it('arrondit vers le haut : une seconde entamée reste affichée', () => {
    expect(formaterRestant(0.4)).toBe('00:01');
  });
});

describe('dureeHms et hms', () => {
  it('produit le format attendu par timer.start', () => {
    expect(dureeHms(7)).toBe('00:07:00');
    expect(dureeHms(120)).toBe('02:00:00');
  });

  it('convertit des secondes, pour l\'ajustement d\'un minuteur en marche', () => {
    expect(hms(600)).toBe('00:10:00');
    expect(hms(65)).toBe('00:01:05');
    expect(hms(3725)).toBe('01:02:05');
  });

  it('ne rend jamais "NaN:NaN:NaN" sur une entrée non finie', () => {
    expect(hms(NaN)).toBe('00:00:00');
  });
});

describe('ancrage à deux horloges', () => {
  it('fait descendre le temps d\'un actif à l\'horloge monotone', () => {
    const v = { slot: 0, timer: 'timer.cuisine', nomEntite: 'x', nom: '', actif: true, restantS: 300 };
    const a = ancrerMinuteur(v, 1000);
    expect(restantAncre(a, 1000)).toBe(300);
    expect(restantAncre(a, 11_000)).toBe(290);
  });

  it('fige le temps d\'un minuteur en pause', () => {
    const v = { slot: 0, timer: 'timer.cuisine', nomEntite: 'x', nom: '', actif: false, restantS: 300 };
    const a = ancrerMinuteur(v, 1000);
    expect(restantAncre(a, 61_000)).toBe(300);
  });

  it('ne descend jamais sous zéro', () => {
    const v = { slot: 0, timer: 'timer.cuisine', nomEntite: 'x', nom: '', actif: true, restantS: 5 };
    expect(restantAncre(ancrerMinuteur(v, 0), 60_000)).toBe(0);
  });
});

describe('constantes', () => {
  it('expose le pas et le nombre de slots', () => {
    expect(PAS_MINUTEUR_S).toBe(300);
    expect(MAX_MINUTEURS).toBe(3);
  });
});
