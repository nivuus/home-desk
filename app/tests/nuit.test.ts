// @vitest-environment jsdom
//
// `rendreNuit` (tâche 8) : trois informations, aucune commande, aucun blanc pur. Testé comme
// `rendreCorps` (cf. `tests/corps.test.ts`) — rendu réel via `lit` + DOM, pas juste la forme du
// `TemplateResult`.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'lit';
import { Etat } from '../src/etat';
import { PIECES } from '../src/pieces';
import { rendreNuit } from '../src/rendu/nuit';

const ev = (id: string, etat: string, attributes: Record<string, unknown> = {}) =>
  ({ entity_id: id, state: etat, attributes });

describe('rendreNuit', () => {
  it('affiche l heure, la temperature (virgule francaise) et la serrure fermee', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.capteur_humain_temperature', '19.6'));
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 42), PIECES.salon), div);

    expect(div.querySelector('.hn')?.textContent).toBe('23:42');
    expect(div.querySelector('.tn')?.textContent).toBe('19,6° salon');
    expect(div.querySelector('.on')?.textContent).toContain('Tout est fermé');
  });

  it('pas de fuite de zero en tete : 5h03 s affiche 05:03', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 5, 3), PIECES.salon), div);
    expect(div.querySelector('.hn')?.textContent).toBe('05:03');
  });

  it('masque le bloc temperature quand le capteur est inutilisable, sans lever', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.capteur_humain_temperature', 'unavailable'));
    const div = document.createElement('div');
    expect(() => render(rendreNuit(etat, new Date(2026, 7, 1, 23, 0), PIECES.salon), div)).not.toThrow();
    expect(div.querySelector('.tn')).toBeNull();
  });

  it('masque le bloc serrure quand elle est deverrouillee', () => {
    const etat = new Etat();
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'unlocked'));
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 0), PIECES.salon), div);
    expect(div.querySelector('.on')).toBeNull();
  });

  it('masque le bloc serrure quand l entite est absente (jamais d etat invente)', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 0), PIECES.salon), div);
    expect(div.querySelector('.on')).toBeNull();
  });

  it('aucune commande : ni tuile ni bouton, seulement les trois blocs texte', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.capteur_humain_temperature', '19.6'));
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 0), PIECES.salon), div);
    expect(div.querySelectorAll('.tuile, .commande, .ambiance, .xl')).toHaveLength(0);
  });

  // Tâche 9, retour du coordinateur : le grisage `.muet` seul (posé sur `#app`, indépendant de
  // cet écran) est un signal trop faible ici — la différence entre 100 % et 55 % d'opacité passe
  // facilement inaperçue sur un écran déjà volontairement sombre et peu contrasté. Sans ce
  // paramètre, la température et la serrure continueraient d'afficher un chiffre précis et
  // confiant (« 25,8° ») alors que la connexion est peut-être morte depuis des heures — sur
  // l'écran auquel une personne qui vient de se réveiller fait le plus confiance.
  it('horsLigne remplace la temperature et la serrure par une note sobre, meme si des donnees valides existent', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.capteur_humain_temperature', '19.6'));
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 42), PIECES.salon, true), div);

    expect(div.querySelector('.hn')?.textContent).toBe('23:42');   // l heure reste fiable : elle
                                                                    // vient de la tablette, pas de HA
    expect(div.querySelector('.tn')).toBeNull();
    expect(div.textContent).toContain('Dernières données');
    // Même registre visuel que le statut serrure habituel (.on, --md-outline) : pas de bandeau
    // coloré façon écran du jour, « rien qui réveille ».
    expect(div.querySelectorAll('.on')).toHaveLength(1);
  });

  it('sans silence (horsLigne omis), le comportement d origine est inchange : parametre retro-compatible', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.capteur_humain_temperature', '19.6'));
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 0), PIECES.salon), div);
    expect(div.querySelector('.tn')?.textContent).toContain('19,6°');
    expect(div.textContent).not.toContain('Dernières données');
  });

  // Tâche 9 (réveil) : le seul geste que cet écran accepte, posé sur le conteneur ENTIER
  // (« appui n'importe où », décision validée) — `rendreNuit` reste une pure fonction de
  // présentation, elle ne fait que prévenir l'appelant via `surReveil`.
  it('appelle le réveil sur un appui n\'importe où, et une seule fois par appui', () => {
    const etat = new Etat();
    const surReveil = vi.fn();
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 3, 3, 14), PIECES.salon, false, surReveil), div);
    div.querySelector<HTMLElement>('.nuit')!.dispatchEvent(new Event('pointerdown'));
    expect(surReveil).toHaveBeenCalledTimes(1);
  });

  // Tâche 7 (mouvement, 2026-08-22) : couverture — la température et le statut de la serrure
  // portent chacun leur marque, pour que le moteur (`src/mouvement/moteur.ts`) anime leur
  // apparition/disparition plutôt que de les faire sauter sec.
  //
  // Mineur (revue finale) — CLÉS DÉSORMAIS DISTINCTES : `detail:nuit-ferme` (« Tout est fermé »,
  // nominal) et `detail:nuit-horsligne` (« Dernières données », horsLigne) ne partagent plus la
  // même clé. Les deux formes restent mutuellement exclusives (un seul `.on` par rendu), donc
  // aucune collision au sens de `comparer()` avec l'ANCIENNE clé unique non plus — mais basculer
  // hors ligne pendant que l'écran de nuit est affiché faisait alors un remplacement SEC (même
  // clé avant/après, aucun état `data-mvt-etat` posé donc aucune mutation) : deux clés distinctes
  // redonnent à ce changement une vraie sortie + une vraie entrée.
  it('la température et le statut de la serrure portent chacun une marque de mouvement', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.capteur_humain_temperature', '19.6'));
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 42), PIECES.salon), div);
    expect(div.querySelector('.tn')?.getAttribute('data-mvt')).toBe('detail:nuit-temp');
    expect(div.querySelector('.on')?.getAttribute('data-mvt')).toBe('detail:nuit-ferme');
  });

  it('la note « Dernières données » (horsLigne) porte SA PROPRE marque, distincte du statut serrure', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 42), PIECES.salon, true), div);
    expect(div.querySelector('.on')?.getAttribute('data-mvt')).toBe('detail:nuit-horsligne');
  });

  it('reste inerte quand aucun réveil n\'est branché', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 3, 3, 14), PIECES.salon, false), div);
    expect(() => div.querySelector<HTMLElement>('.nuit')!.dispatchEvent(new Event('pointerdown')))
      .not.toThrow();
  });
});
