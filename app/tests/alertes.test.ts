import { describe, it, expect, vi } from 'vitest';
import { Etat } from '../src/etat';
import { collecterAlertes, dernierMouvement, CAPTEURS_MOUVEMENT } from '../src/alertes';

describe('collecterAlertes', () => {
  // Ronde de correction 1 : `binary_sensor.distributeur_de_croquettes_probleme` (device_class
  // `problem`) remplace `..._alimentation`, qui était à `off` en fonctionnement NORMAL (le moteur
  // ne tourne que par à-coups) — l'ancienne règle aurait donc alerté en permanence.
  // Ronde de correction 2 : `sujet` vérifié à côté de `cle`, pas seulement sa présence — c'est
  // lui que `rendreAlerte` affiche en première ligne (`rendu/corps.ts`), il doit venir de la
  // règle elle-même, jamais d'une déduction ailleurs.
  it('signale une panne du distributeur de croquettes', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'binary_sensor.distributeur_de_croquettes_probleme', state: 'on', attributes: {} });
    const alertes = collecterAlertes(e, 0);
    expect(alertes.map((a) => a.cle)).toContain('croquettes');
    expect(alertes.find((a) => a.cle === 'croquettes')?.sujet).toBe('Croquettes');
  });

  it('signale une fontaine à remplir', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'binary_sensor.eversweet_3_pro_uvc_niveau_d_eau', state: 'on', attributes: {} });
    const alertes = collecterAlertes(e, 0);
    expect(alertes.map((a) => a.cle)).toContain('eau');
    expect(alertes.find((a) => a.cle === 'eau')?.sujet).toBe('Fontaine');
  });

  it('signale une porte déverrouillée', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'lock.aqara_smart_lock_u200_lite', state: 'unlocked', attributes: {} });
    const alertes = collecterAlertes(e, 0);
    expect(alertes.map((a) => a.cle)).toContain('serrure');
    expect(alertes.find((a) => a.cle === 'serrure')?.sujet).toBe('Porte');
  });

  // Ronde de correction 1 (IMPORTANT), justification corrigée en ronde de correction 2 : la
  // fenêtre de la cuisine n'est PAS ouverte par une automation (celle-ci ne fait que SUGGÉRER
  // l'aération par notification — « Velux/fenêtres manuelles → notif uniquement, pas
  // pilotables », `automations.yaml`, `auto_3a784b7f` — et il n'existe aucune entité d'ouvrant
  // pilotable pour cette fenêtre, un capteur IKEA PARASOLL, pas un moteur). C'est Maxime qui
  // ouvre à la main sur cette suggestion — l'état qui en résulte est voulu et dure des heures
  // tout autant que si un automate l'avait fait. Elle a été retirée de `REGLES` ; ce test de
  // non-régression prouve qu'un binary_sensor de fenêtre à `on` ne produit plus jamais d'alerte,
  // quel que soit son entity_id (elle reste dans `ligneSynthese`, sa place). Sans ce test, un
  // futur ajout pourrait la réintroduire par erreur (ex. copier-coller depuis `pieces.ts`) sans
  // qu'aucun test ne le remarque.
  it('ne signale JAMAIS une fenêtre ouverte : ouverte a la main sur suggestion, etat voulu et durable', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'binary_sensor.fenetre_c_ouverture', state: 'on', attributes: {} });
    expect(collecterAlertes(e, 0)).toEqual([]);
  });

  it('ne signale JAMAIS la batterie de la voiture, qui dure des heures', () => {
    // Règle du spec : une condition durable est une tâche, pas une alerte. alerte_voiture a
    // monopolisé les trois écrans une journée entière pour avoir enfreint ça.
    const e = new Etat();
    e.appliquer({ entity_id: 'sensor.peugeot_e208_batterie_niveau', state: '21', attributes: {} });
    expect(collecterAlertes(e, 0)).toEqual([]);
  });

  // Ronde de correction 1 : `binary_sensor.distributeur_de_croquettes_probleme` est justement
  // `unavailable` sur l'installation réelle au moment de cette correction (capteur cloud
  // instable) — l'occasion, signalée comme manquante dans le rapport initial, d'exercer la garde
  // `estUtilisable` sur un cas réel plutôt que sur un capteur choisi pour l'exercice.
  it('ignore un capteur muet (cas réel : le capteur de panne croquettes est actuellement unavailable)', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'binary_sensor.distributeur_de_croquettes_probleme', state: 'unavailable', attributes: {} });
    expect(collecterAlertes(e, 0)).toEqual([]);
  });
});

describe('dernierMouvement', () => {
  it('retient le plus récent des six capteurs', () => {
    // `changeLe` est posé par Etat.appliquer, pas par Home Assistant : les événements
    // state_changed portent last_changed hors des attributs, et on ne le reçoit pas
    // pour les états initiaux. On horodate donc nous-mêmes.
    const e = new Etat();
    e.appliquer({ entity_id: CAPTEURS_MOUVEMENT[0], state: 'on', attributes: {} });
    e.appliquer({ entity_id: CAPTEURS_MOUVEMENT[0], state: 'off', attributes: {} });
    const t = e.lire(CAPTEURS_MOUVEMENT[0])!.changeLe;
    expect(dernierMouvement(e)).toBe(t);
  });

  it('rend maintenant si un capteur est actif : quelqu un bouge à l instant', () => {
    const e = new Etat();
    e.appliquer({ entity_id: CAPTEURS_MOUVEMENT[0], state: 'on', attributes: {} });
    expect(dernierMouvement(e)).toBeGreaterThan(Date.now() - 1000);
  });

  it('rend 0 sans aucun capteur connu, ce qui laisse l alerte se replier', () => {
    expect(dernierMouvement(new Etat())).toBe(0);
  });

  // Ajouté en plus du brief : les trois tests ci-dessus n'exercent jamais la branche `e.etat
  // === 'on'` de façon distinctive — dans chacun, l'état vient tout juste de passer à `on`, donc
  // `changeLe` vaut déjà `Date.now()` par construction (`Etat.appliquer`), et le résultat serait
  // identique même si cette branche était supprimée (vérifié par mutation : supprimer la ligne
  // `if (e.etat === 'on') return Date.now();` laisse les 6 tests du brief verts). Ce test isole
  // le cas où la branche fait une vraie différence : un capteur passé à `on` il y a longtemps
  // (`changeLe` ancien) et TOUJOURS `on` maintenant — la maison bouge encore à l'instant présent,
  // ce n'est pas parce que le dernier changement d'état date d'il y a 20 minutes que plus
  // personne ne bouge.
  it('un capteur ON depuis longtemps (changeLe ancien) compte comme un mouvement À L INSTANT, pas depuis changeLe', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
      const e = new Etat();
      e.appliquer({ entity_id: CAPTEURS_MOUVEMENT[0], state: 'on', attributes: {} });
      const changeLeAncien = e.lire(CAPTEURS_MOUVEMENT[0])!.changeLe;

      vi.setSystemTime(new Date(2026, 7, 1, 14, 20));   // 20 min plus tard, capteur toujours 'on'

      expect(dernierMouvement(e)).toBe(Date.now());
      expect(dernierMouvement(e)).not.toBe(changeLeAncien);
    } finally {
      vi.useRealTimers();
    }
  });
});
