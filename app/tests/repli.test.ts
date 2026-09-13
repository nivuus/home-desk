// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from 'lit';
import {
  sessionAbsente, erreurDemarrage, ecranEnAttente, choisirEcran,
  aucunEcranConfigure, versionRefusee, configIllisible, integrationAbsente,
  ecranDeLaPanne,
} from '../src/rendu/repli';
import type { Panne } from '../src/configuration';

function texteDe(gabarit: ReturnType<typeof sessionAbsente>): string {
  const hote = document.createElement('div');
  render(gabarit, hote);
  return hote.textContent!.replace(/\s+/g, ' ').trim();
}

describe('les sept écrans de repli — chacun NOMME UN GESTE', () => {
  // Leçon 2 : un test qui épingle la moitié d'un message laisse l'autre moitié mentir. On
  // épingle donc la phrase RENDUE en entier, et on exige qu'elle dise quoi faire. Un écran
  // qui décrit une panne sans nommer de geste est un bouton mort en prose.
  it('session absente : dit d ouvrir HA et de recharger', () => {
    expect(texteDe(sessionAbsente())).toBe(
      'Session Ouvre Home Assistant sur cette tablette et connecte-toi, puis recharge cette page.');
  });

  it('erreur de démarrage : texte INCHANGÉ par le déménagement', () => {
    // Contre-épreuve du déplacement : cette phrase existait dans `demarrage.ts` avant cette
    // tâche. La déplacer ne doit pas la réécrire — sinon le déménagement change le
    // comportement en se faisant passer pour un rangement.
    expect(texteDe(erreurDemarrage())).toBe(
      "Connexion impossible L'écran n'arrive pas à joindre la maison. Ça peut venir du réseau "
      + 'ou de la session : une nouvelle tentative va avoir lieu automatiquement. Si ça persiste, '
      + 'réouvre Home Assistant sur cette tablette et reconnecte-toi.');
  });

  it('attente : nomme l écran demandé, pour qu on voie tout de suite si l URL est fausse', () => {
    expect(texteDe(ecranEnAttente('Cuisine'))).toBe(
      'Cuisine Chargement de la configuration depuis Home Assistant…');
  });

  it('aucun écran configuré : dit OÙ aller le créer', () => {
    expect(texteDe(aucunEcranConfigure())).toBe(
      'Aucun écran configuré Ouvre Home Assistant, puis Paramètres > Appareils et services > '
      + 'Tablettes murales, et ajoute un écran.');
  });

  it('version refusée : dit de mettre à jour l intégration', () => {
    expect(texteDe(versionRefusee('Salon'))).toBe(
      "Configuration illisible La configuration de « Salon » a été écrite par une autre version "
      + "de l'intégration Tablettes murales. Mets à jour l'intégration, ou recrée cet écran "
      + 'depuis Paramètres > Appareils et services > Tablettes murales.');
  });

  it('configuration corrompue : dit de corriger ou de restaurer', () => {
    expect(texteDe(configIllisible('Bureau'))).toBe(
      'Configuration invalide La configuration de « Bureau » ne respecte plus le contrat. '
      + 'Corrige-la depuis Paramètres > Appareils et services > Tablettes murales, ou restaure '
      + 'une sauvegarde antérieure.');
  });

  it('intégration absente : dit de l INSTALLER, jamais de vérifier le réseau', () => {
    // C'est la cinquième dégradation, et la raison d'être de tout ce lot. HA a répondu
    // `unknown_command` — instantanément, correctement. Renvoyer l'opérateur déboguer son
    // Wi-Fi serait un mensonge, et le bouton mort en prose sous sa forme la plus coûteuse.
    const texte = texteDe(integrationAbsente());
    expect(texte).toBe(
      "Intégration absente L'intégration Tablettes murales n'est pas installée sur ce Home "
      + 'Assistant. Installe-la, puis ajoute un écran depuis Paramètres > Appareils et '
      + 'services.');
    expect(texte).not.toMatch(/réseau|Wi-Fi|wifi/i);
  });
});

describe('choisirEcran — la première dégradation', () => {
  it('rend un lien tapable par écran, portant le NOM exact', () => {
    // `?ecran=` porte le `nom` (« Salon »), jamais la clé de `ECRANS` (« salon ») : le
    // transport apparie exactement (`websocket.py`, `_trouver`).
    const hote = document.createElement('div');
    render(choisirEcran([{ nom: 'Salon', titre: 'Salon' },
                         { nom: 'Salle de bain', titre: 'SdB' }]), hote);
    const liens = Array.from(hote.querySelectorAll('a'));
    expect(liens.map((a) => a.getAttribute('href')))
      .toEqual(['?ecran=Salon', '?ecran=Salle%20de%20bain']);
    expect(liens.map((a) => a.textContent!.trim())).toEqual(['Salon', 'SdB']);
  });

  it('affiche le TITRE mais navigue vers le NOM — ce sont deux champs distincts', () => {
    // `titre` est `ConfigSubentry.title`, renommable seul par le geste générique de HA.
    // Confondre les deux enverrait vers un écran introuvable dès qu'ils divergent.
    const hote = document.createElement('div');
    render(choisirEcran([{ nom: 'Cuisine', titre: 'Le plan de travail' }]), hote);
    const lien = hote.querySelector('a')!;
    expect(lien.getAttribute('href')).toBe('?ecran=Cuisine');
    expect(lien.textContent!.trim()).toBe('Le plan de travail');
  });

  it('retombe sur « aucun écran configuré » quand la liste est vide', () => {
    expect(texteDe(choisirEcran([]))).toBe(texteDe(aucunEcranConfigure()));
  });
});

describe('ecranDeLaPanne — la table complète, décor à CINQ pannes', () => {
  // Leçon 3 : un décor trop pauvre rend le test aveugle. Avec une seule panne, une table qui
  // rendrait TOUJOURS le même écran passerait.
  const toutes: Panne[] = ['introuvable', 'version', 'corrompu', 'integrationAbsente', 'reseau'];

  it('rend un écran DIFFÉRENT pour chacune des cinq pannes', () => {
    const rendus = toutes.map((p) => texteDe(ecranDeLaPanne(p, 'Salon')));
    expect(new Set(rendus).size).toBe(5);
  });

  it('ne rend JAMAIS un gabarit vide, quelle que soit la panne', () => {
    // La règle posée par la ronde de correction 1 : aucune dégradation ne laisse `#app` vide.
    for (const p of toutes) {
      expect(texteDe(ecranDeLaPanne(p, 'Salon')).length).toBeGreaterThan(40);
    }
  });

  it('associe chaque panne à SON écran, pas à celui du voisin', () => {
    expect(texteDe(ecranDeLaPanne('version', 'Salon'))).toBe(texteDe(versionRefusee('Salon')));
    expect(texteDe(ecranDeLaPanne('corrompu', 'Salon'))).toBe(texteDe(configIllisible('Salon')));
    expect(texteDe(ecranDeLaPanne('integrationAbsente', 'Salon')))
      .toBe(texteDe(integrationAbsente()));
    expect(texteDe(ecranDeLaPanne('reseau', 'Salon'))).toBe(texteDe(erreurDemarrage()));
  });

  it('« introuvable » sans liste connue invite à choisir, pas à réparer', () => {
    // Leçon 2, jouée jusqu'au bout ici aussi : épingler la phrase ENTIÈRE, pas seulement la
    // moitié « description de la panne ». La moitié « geste » (vérifier l'adresse, ou créer
    // l'écran depuis Paramètres) doit être gardée au même titre que les six autres écrans.
    expect(texteDe(ecranDeLaPanne('introuvable', 'Inconnu'))).toBe(
      "Écran inconnu « Inconnu » n'est pas un écran configuré sur ce Home Assistant. "
      + "Vérifie l'adresse de cette tablette, ou crée cet écran depuis Paramètres > "
      + 'Appareils et services > Tablettes murales.');
  });
});
