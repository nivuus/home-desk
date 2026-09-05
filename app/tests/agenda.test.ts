import { describe, it, expect } from 'vitest';
import { pastilleBandeau, estCeJour, jourDe, prochainChangement, type Evenement } from '../src/agenda';
import type { Prevision } from '../src/meteo';

const MAINTENANT = new Date('2026-08-02T19:00:00');
const DEMAIN: Prevision = { datetime: '2026-08-03T12:00:00', condition: 'rainy', temperature: 35 };
// Tâche 13 : `pastilleBandeau` reçoit désormais toute la fenêtre `daily`, pas le seul lendemain —
// mais sans entrée pour AUJOURD'HUI (2026-08-02) dans ce tableau, `prochainChangement` n'a aucun
// repère et rend `null` : le repli retombe exactement sur l'ancien comportement (« Demain » +
// `phraseDemain(DEMAIN)`), ce qui laisse les tests de priorité ci-dessous inchangés dans leurs
// attentes — seul l'appel change de forme (tableau au lieu d'un objet seul).
const JOURS_SANS_AUJOURDHUI: Prevision[] = [DEMAIN];

const anniv: Evenement = { resume: 'Anniversaire de Julie', debut: '2026-08-02T00:00:00', estAnniversaire: true };
const bientot: Evenement = { resume: 'Dentiste', debut: '2026-08-02T20:30:00', estAnniversaire: false };
const loin: Evenement = { resume: 'Réunion', debut: '2026-08-03T09:00:00', estAnniversaire: false };

// Revue tâche 12 : ces deux fonctions vivaient dans la fermeture de `demarrer()`, donc
// inatteignables par un test alors qu'elles sont pures — et c'est `estCeJour` qui porte le filtre
// dont dépend « un anniversaire de demain ne s'affiche jamais Aujourd'hui ».
describe('jourDe / estCeJour', () => {
  it('rend la date locale au format AAAA-MM-JJ, mois et jour sur deux chiffres', () => {
    expect(jourDe(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(jourDe(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('reconnaît la forme `start.date` à dix caractères d\'une journée entière', () => {
    // C'est la forme RÉELLE d'un anniversaire Home Assistant, et la raison d'être de la
    // comparaison textuelle : `new Date('2026-08-02')` vaut minuit UTC, donc le 1er août sous un
    // fuseau négatif — l'anniversaire reculerait d'un jour.
    expect(estCeJour('2026-08-02', new Date(2026, 7, 2, 19, 0))).toBe(true);
    expect(estCeJour('2026-08-03', new Date(2026, 7, 2, 19, 0))).toBe(false);
    expect(estCeJour('2026-08-01', new Date(2026, 7, 2, 0, 30))).toBe(false);
  });

  it('reconnaît la forme `start.dateTime` avec heure et décalage', () => {
    expect(estCeJour('2026-08-02T15:30:00+02:00', new Date(2026, 7, 2, 19, 0))).toBe(true);
    expect(estCeJour('2026-08-03T00:15:00+02:00', new Date(2026, 7, 2, 23, 59))).toBe(false);
  });

  it('ne prend jamais une chaîne vide pour aujourd\'hui', () => {
    expect(estCeJour('', new Date(2026, 7, 2))).toBe(false);
  });
});

describe('prochainChangement', () => {
  const jour = (d: string, condition: string, temperature: number) =>
    ({ datetime: d, condition, temperature } as Prevision);

  it('saute les jours identiques et annonce le premier qui diffère', () => {
    const jours = [
      jour('2026-08-03T12:00:00', 'sunny', 29),
      jour('2026-08-04T12:00:00', 'sunny', 30),
      jour('2026-08-05T12:00:00', 'rainy', 21),
    ];
    expect(prochainChangement(jours, new Date('2026-08-03T09:00:00')))
      .toEqual({ jour: 'mercredi', condition: 'rainy', temperature: 21 });
  });

  it('dit « Demain » quand le changement est pour le lendemain', () => {
    const jours = [
      jour('2026-08-03T12:00:00', 'sunny', 29),
      jour('2026-08-04T12:00:00', 'rainy', 20),
    ];
    expect(prochainChangement(jours, new Date('2026-08-03T09:00:00'))?.jour).toBe('Demain');
  });

  it('rend null quand rien ne change', () => {
    const jours = [
      jour('2026-08-03T12:00:00', 'sunny', 29),
      jour('2026-08-04T12:00:00', 'sunny', 30),
      jour('2026-08-05T12:00:00', 'sunny', 31),
    ];
    expect(prochainChangement(jours, new Date('2026-08-03T09:00:00'))).toBeNull();
  });

  it('compare à AUJOURD\'HUI, jamais au jour précédent', () => {
    // sunny, cloudy, cloudy : le changement est mercredi (J+1), pas jeudi.
    const jours = [
      jour('2026-08-03T12:00:00', 'sunny', 29),
      jour('2026-08-04T12:00:00', 'cloudy', 25),
      jour('2026-08-05T12:00:00', 'cloudy', 24),
    ];
    expect(prochainChangement(jours, new Date('2026-08-03T09:00:00'))?.jour).toBe('Demain');
  });

  it('traverse une liste qui ne commence pas par aujourd\'hui sans inventer', () => {
    expect(prochainChangement([], new Date('2026-08-03T09:00:00'))).toBeNull();
    expect(prochainChangement([jour('2026-08-03T12:00:00', 'sunny', 29)],
                              new Date('2026-08-03T09:00:00'))).toBeNull();
  });

  // Cas ajouté (non fourni par le brief), revue à froid : les deux exemples ci-dessus n'ont AUCUN
  // jour futur, donc un code qui prendrait `jours[0]` comme « la condition d'aujourd'hui » — au
  // lieu de chercher l'entrée dont la date vaut réellement `maintenant` — les passerait quand même
  // au vert. Ici, la fenêtre ne contient PAS aujourd'hui (elle commence demain) mais porte un vrai
  // changement entre ses deux entrées : un code qui utiliserait `jours[0]` comme référence
  // inventerait un changement dès demain, alors qu'on ne sait rien de la condition RÉELLE
  // d'aujourd'hui. `null` est la seule réponse honnête.
  it('n\'invente pas de repère quand la fenêtre ne contient pas aujourd\'hui', () => {
    const jours = [
      jour('2026-08-04T12:00:00', 'sunny', 30),
      jour('2026-08-05T12:00:00', 'rainy', 21),
    ];
    expect(prochainChangement(jours, new Date('2026-08-03T09:00:00'))).toBeNull();
  });
});

describe('pastilleBandeau', () => {
  it('l\'anniversaire du jour prime sur tout', () => {
    expect(pastilleBandeau([bientot, anniv], JOURS_SANS_AUJOURDHUI, MAINTENANT, false))
      .toEqual({ etiquette: 'Aujourd\'hui', valeur: 'Anniversaire de Julie' });
  });

  it('un rendez-vous dans les 3 heures prime sur Demain', () => {
    expect(pastilleBandeau([bientot], JOURS_SANS_AUJOURDHUI, MAINTENANT, false))
      .toEqual({ etiquette: '20:30', valeur: 'Dentiste' });
  });

  // Ronde de correction 1 (coordinateur, tâche 14) : le bureau montre déjà le prochain
  // rendez-vous EN GRAND dans son bloc central (`rendreProchainRdv`, `rendu/defaut.ts`) — sans
  // `masquerRdv`, la même donnée apparaissait aussi ici, dans la fenêtre de 3 h la plus courante.
  it('masquerRdv retire le rendez-vous proche, retombe sur Demain', () => {
    expect(pastilleBandeau([bientot], JOURS_SANS_AUJOURDHUI, MAINTENANT, false, true))
      .toEqual({ etiquette: 'Demain', valeur: '35° et de la pluie', accent: '35°' });
  });

  // Contre-épreuve : `masquerRdv` ne coupe PAS plus large que nécessaire — l'anniversaire du jour
  // reste prioritaire, puisque `rendreProchainRdv` ne le montre jamais (pas d'heure, cf. son
  // docstring) : rien à dédoublonner de ce côté.
  it('masquerRdv laisse l\'anniversaire du jour intact', () => {
    expect(pastilleBandeau([anniv, bientot], JOURS_SANS_AUJOURDHUI, MAINTENANT, false, true))
      .toEqual({ etiquette: 'Aujourd\'hui', valeur: 'Anniversaire de Julie' });
  });

  it('un rendez-vous au-delà de 3 heures ne prime pas', () => {
    expect(pastilleBandeau([loin], JOURS_SANS_AUJOURDHUI, MAINTENANT, false))
      .toEqual({ etiquette: 'Demain', valeur: '35° et de la pluie', accent: '35°' });
  });

  it('retombe toujours sur Demain, donc n\'est jamais vide sans raison', () => {
    expect(pastilleBandeau([], JOURS_SANS_AUJOURDHUI, MAINTENANT, false))
      .toEqual({ etiquette: 'Demain', valeur: '35° et de la pluie', accent: '35°' });
  });

  it('le modulateur invités masque agenda et anniversaire, jamais Demain', () => {
    expect(pastilleBandeau([anniv, bientot], JOURS_SANS_AUJOURDHUI, MAINTENANT, true))
      .toEqual({ etiquette: 'Demain', valeur: '35° et de la pluie', accent: '35°' });
  });

  it('rend null quand il n\'y a ni événement ni prévision', () => {
    expect(pastilleBandeau([], [], MAINTENANT, false)).toBeNull();
  });

  it('ignore un événement déjà passé', () => {
    const passe: Evenement = { resume: 'Fini', debut: '2026-08-02T18:00:00', estAnniversaire: false };
    expect(pastilleBandeau([passe], JOURS_SANS_AUJOURDHUI, MAINTENANT, false))
      .toEqual({ etiquette: 'Demain', valeur: '35° et de la pluie', accent: '35°' });
  });

  it('prend le plus proche quand plusieurs rendez-vous sont dans la fenêtre', () => {
    const tard: Evenement = { resume: 'Tard', debut: '2026-08-02T21:30:00', estAnniversaire: false };
    expect(pastilleBandeau([tard, bientot], JOURS_SANS_AUJOURDHUI, MAINTENANT, false)!.valeur).toBe('Dentiste');
  });

  // Tâche 13 : le repli n'est plus systématiquement « Demain » + la météo du lendemain — quand un
  // vrai changement de condition dominante arrive dans la fenêtre, c'est LUI que la pastille
  // annonce, avec son propre jour et sa propre température.
  it('le repli annonce le prochain changement de condition quand il y en a un', () => {
    const jours: Prevision[] = [
      { datetime: '2026-08-02T12:00:00', condition: 'sunny', temperature: 33 },
      { datetime: '2026-08-03T12:00:00', condition: 'sunny', temperature: 34 },
      { datetime: '2026-08-04T12:00:00', condition: 'rainy', temperature: 21 },
    ];
    expect(pastilleBandeau([], jours, MAINTENANT, false))
      .toEqual({ etiquette: 'mardi', valeur: '21° et de la pluie', accent: '21°' });
  });

  // Contre-épreuve : sans changement de condition dans la fenêtre, `prochainChangement` rend
  // `null` et la pastille retombe bien sur l'ancien comportement (jamais un vide).
  it('retombe sur Demain quand la fenêtre ne porte aucun changement de condition', () => {
    const jours: Prevision[] = [
      { datetime: '2026-08-02T12:00:00', condition: 'sunny', temperature: 33 },
      { datetime: '2026-08-03T12:00:00', condition: 'sunny', temperature: 34 },
      { datetime: '2026-08-04T12:00:00', condition: 'sunny', temperature: 32 },
    ];
    expect(pastilleBandeau([], jours, MAINTENANT, false))
      .toEqual({ etiquette: 'Demain', valeur: '34° et du soleil', accent: '34°' });
  });

  describe('pastilleBandeau — accent coloré', () => {
    it('marque la température du repli « Demain »', () => {
      const p = pastilleBandeau([], JOURS_SANS_AUJOURDHUI, MAINTENANT, false)!;
      expect(p.valeur).toBe('35° et de la pluie');
      expect(p.accent).toBe('35°');
      // L'invariant sur lequel `bandeau.ts` s'appuie pour découper sans jamais tronquer.
      expect(p.valeur.startsWith(p.accent!)).toBe(true);
    });

    it('marque la température d\'un changement de temps annoncé', () => {
      const jours: Prevision[] = [
        { datetime: '2026-08-02T12:00:00', condition: 'sunny', temperature: 30 },
        { datetime: '2026-08-04T12:00:00', condition: 'rainy', temperature: 21.6 },
      ];
      const p = pastilleBandeau([], jours, MAINTENANT, false)!;
      expect(p.accent).toBe('22°');
      expect(p.valeur.startsWith(p.accent!)).toBe(true);
    });

    it('ne marque RIEN sur un anniversaire — il n\'y a aucune température à colorer', () => {
      const p = pastilleBandeau([anniv], JOURS_SANS_AUJOURDHUI, MAINTENANT, false)!;
      expect(p.valeur).toBe('Anniversaire de Julie');
      expect(p.accent).toBeUndefined();
    });

    it('ne marque RIEN sur un rendez-vous proche', () => {
      const p = pastilleBandeau([bientot], JOURS_SANS_AUJOURDHUI, MAINTENANT, false)!;
      expect(p.valeur).toBe('Dentiste');
      expect(p.accent).toBeUndefined();
    });
  });
});
