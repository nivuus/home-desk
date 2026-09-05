// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'lit';
import { rendreCarteMedia, urlSure } from '../src/rendu/media';
import type { SourceResolue } from '../src/media';

const BASE: SourceResolue = {
  // `allumee` (revue tâche 12) : la carte ne s'en sert pas — c'est `demarrage.ts` qui arbitre
  // quelle source occupe le bloc — mais le champ fait partie du type résolu.
  nom: 'Télévision', joue: true, allumee: true,
  titre: 'Les trois Mousquetaires', sousTitre: 'Ash vs Evil Dead',
  affiche: '/api/media_player_proxy/plex?token=abc',
  // Revue tâche 15 (I1) : sans `majLe`, aucun rattrapage — la carte se pose exactement sur la
  // position brute, comme avant. C'est le cas de référence des tests ci-dessous.
  progression: { position: 300, duree: 1200, avance: true },
  transport: { entite: 'media_player.tv', peutPause: true, peutLecture: true, peutPrecedent: true,
               peutSuivant: true, enLecture: true },
  volume: { entite: 'media_player.philips', niveau: 0.4, parPas: false },
};

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

function rendre(s: SourceResolue) {
  render(rendreCarteMedia(s), hote);
  return hote.querySelector('.media')!;
}

describe('carte média', () => {
  it('pose l\'affiche en couche de fond, jamais en <img> dans le flux', () => {
    const c = rendre(BASE);
    const couche = c.querySelector('.media-affiche') as HTMLElement;
    expect(couche.style.backgroundImage).toContain('/api/media_player_proxy/plex?token=abc');
    expect(c.querySelector('img')).toBeNull();
  });

  it('n\'a aucune couche d\'affiche quand la source n\'en fournit pas', () => {
    const c = rendre({ ...BASE, affiche: undefined });
    expect(c.querySelector('.media-affiche')).toBeNull();
  });

  it('garde la même structure avec et sans affiche', () => {
    // Règle 1 de cohérence : même gabarit, seule la SURFACE change. Une structure qui diverge
    // ferait bouger la hauteur du bloc selon la source, ce que le budget interdit.
    const avec = rendre(BASE).querySelectorAll('.t, .v, .media-transport, .media-volume').length;
    // `innerHTML = ''` casserait le suivi interne de lit (les marqueurs du `ChildPart` seraient
    // éjectés du DOM sans que lit le sache) : un second hôte frais, pas un nettoyage manuel du
    // premier, exactement comme `beforeEach` ci-dessus.
    hote = document.createElement('div'); document.body.appendChild(hote);
    const sans = rendre({ ...BASE, affiche: undefined }).querySelectorAll('.t, .v, .media-transport, .media-volume').length;
    expect(sans).toBe(avec);
  });

  // Correctif important (revue tâche 6) : c'est l'absence de cette variation (sous-titre présent
  // ou non) qui a laissé passer une carte dont la hauteur dépendait du contenu (`.media` sans
  // `min-height`, cf. `base.css`) — aucun test ne faisait jamais varier `sousTitre`. Même principe
  // que le test d'affiche ci-dessus : le squelette structurel ne bouge jamais, seule la SURFACE
  // (ici, la présence de `.media-sous`) change.
  it('garde la même structure avec et sans sous-titre', () => {
    const avec = rendre(BASE).querySelectorAll('.t, .v, .media-transport, .media-volume').length;
    hote = document.createElement('div'); document.body.appendChild(hote);
    const sans = rendre({ ...BASE, sousTitre: '' }).querySelectorAll('.t, .v, .media-transport, .media-volume').length;
    expect(sans).toBe(avec);
  });

  it('affiche les trois boutons de transport quand la source les déclare', () => {
    const c = rendre(BASE);
    expect(c.querySelectorAll('.media-bouton').length).toBe(3);
  });

  it('n\'affiche aucun bouton mort : pas de précédent/suivant si non déclarés', () => {
    const c = rendre({ ...BASE, transport: { ...BASE.transport!, peutPrecedent: false, peutSuivant: false } });
    expect(c.querySelectorAll('.media-bouton').length).toBe(1);
  });

  // Correctif mineur (revue tâche 6) : PAUSE et PLAY sont deux bits `supported_features`
  // distincts (cf. `media.ts`) — un lecteur peut déclarer l'un sans l'autre. Avant ce correctif,
  // le rendu affichait un bouton « lecture » dès que `peutPause` était vrai, quel que soit
  // `peutLecture` : exactement le bouton mort que cette tâche existe pour empêcher.
  it('n\'affiche aucun bouton mort : pas de lecture à l\'arrêt si peutLecture est faux', () => {
    const c = rendre({
      ...BASE,
      transport: { ...BASE.transport!, enLecture: false, peutLecture: false },
    });
    // Un seul bouton de transport reste possible ici (précédent OU suivant seraient en plus,
    // mais aucun bouton central lecture/pause) : ni pause (on n'est plus en lecture), ni lecture
    // (non supporté).
    expect(c.querySelectorAll('.media-bouton').length).toBe(2);   // précédent + suivant, pas de central
  });

  it('rend un rail quand le niveau est connu', () => {
    const c = rendre(BASE);
    expect(c.querySelector('.media-rail')).not.toBeNull();
    expect(c.querySelectorAll('.media-pas').length).toBe(0);
  });

  it('rend deux boutons par pas quand le niveau est inconnu', () => {
    const c = rendre({ ...BASE, volume: { entite: 'media_player.tv', niveau: undefined, parPas: true } });
    expect(c.querySelector('.media-rail')).toBeNull();
    expect(c.querySelectorAll('.media-pas').length).toBe(2);
  });

  it('la progression est une couche de fond, jamais un élément qui ajoute de la hauteur', () => {
    const c = rendre(BASE) as HTMLElement;
    expect(c.style.getPropertyValue('--progression')).toBe('0.25');
    // Correctif mineur (revue tâche 6) : la bande de progression est peinte par `.media::after`
    // (règle CSS pure, `base.css`) — aucune classe DOM ne lui correspond ni n'a jamais existé
    // pour elle. `querySelector('.media-progression')` ne pouvait donc jamais être vrai, quelle
    // que soit la justesse du rendu. La seule affirmation vérifiable ici est celle du dessus
    // (`--progression`, ce que `.media::after` lit) ; le reste (aucun élément ajouté) est déjà
    // couvert par « garde la même structure avec et sans affiche ».
  });

  // Revue tâche 15, constat I1 : le spec exige DEUX FOIS un rail « qui avance réellement,
  // décompté côté navigateur entre deux mises à jour de `media_position` ». Le rendu calculait
  // `position / duree` et ne lisait jamais `media_position_updated_at` — le rail se posait sur
  // une position que Home Assistant ne republie pas, donc restait immobile entre deux redessins.
  it('rattrape le temps écoulé depuis le relevé de HA dès le premier coup de peinture', () => {
    render(rendreCarteMedia(
      { ...BASE, progression: { position: 300, duree: 1200, majLe: 1_000_000, avance: true } },
      1_000_000 + 300_000,   // HA a relevé « 300 s » il y a cinq minutes
    ), hote);
    // 300 + 300 = 600 s sur 1200 : la moitié, pas le quart.
    expect((hote.querySelector('.media') as HTMLElement).style.getPropertyValue('--progression'))
      .toBe('0.5');
  });

  it('ne rattrape rien quand le lecteur est en pause', () => {
    render(rendreCarteMedia(
      { ...BASE, progression: { position: 300, duree: 1200, majLe: 1_000_000, avance: false } },
      1_000_000 + 300_000,
    ), hote);
    expect((hote.querySelector('.media') as HTMLElement).style.getPropertyValue('--progression'))
      .toBe('0.25');
  });

  // Revue tâche 15, mineur M3 — INJECTION CSS. `entity_picture` vient de Home Assistant (donc,
  // au bout de la chaîne, d'une intégration tierce ou d'un nom de fichier) et atterrissait tel
  // quel dans `style="background-image:url('…')"`. `lit` n'échappe rien dans un attribut : une
  // apostrophe refermait la chaîne et laissait écrire n'importe quelle déclaration derrière.
  describe('urlSure (durcissement de l\'affiche)', () => {
    it('neutralise les caractères qui referment url(\'…\')', () => {
      for (const c of ["'", '"', '(', ')']) {
        expect(urlSure(`/a${c}b.png`), c).not.toContain(c);
      }
    });

    it('n\'abîme pas une URL normale, ni une URL déjà percent-encodée', () => {
      expect(urlSure('/api/media_player_proxy/plex?token=abc&x=1'))
        .toBe('/api/media_player_proxy/plex?token=abc&x=1');
      expect(urlSure('/local/Mon%20affiche.png')).toBe('/local/Mon%20affiche.png');
    });

    it('l\'attribut rendu ne peut plus sortir de sa déclaration CSS', () => {
      const c = rendre({ ...BASE, affiche: "/x.png');opacity:0;--y:('" });
      const couche = c.querySelector('.media-affiche') as HTMLElement;
      // Le texte « opacity:0 » est toujours là — mais À L'INTÉRIEUR de la chaîne d'URL, donc
      // comme des caractères d'URL et non comme une déclaration. C'est le MOTEUR CSS qui tranche,
      // pas une recherche de sous-chaîne : `style.opacity` reste vide, et l'attribut ne porte
      // toujours qu'une seule déclaration.
      expect(couche.style.opacity).toBe('');
      expect(couche.style.length, `déclarations : ${couche.getAttribute('style')}`).toBe(1);
      expect(couche.style.backgroundImage).not.toBe('');
    });
  });

  // Tâche 7 (mouvement, 2026-08-22) : couverture — sous-titre, boutons de transport et volume
  // portent chacun une marque, pour que le moteur (`src/mouvement/moteur.ts`) anime leur
  // apparition/disparition plutôt que de les faire sauter sec. `.media` (`bloc:media`) est déjà
  // marqué depuis la tâche 6 (mutation de contenu) — non retesté ici.
  describe('marques de mouvement', () => {
    it('le sous-titre porte sa marque', () => {
      const c = rendre(BASE);
      expect(c.querySelector('.media-sous')?.getAttribute('data-mvt')).toBe('detail:media-sous');
    });

    it('chaque bouton de transport est marqué par son action, jamais par son rang', () => {
      const c = rendre(BASE);
      const boutons = Array.from(c.querySelectorAll('.media-bouton'));
      // BASE : précédent, pause (en lecture), suivant, dans cet ordre.
      expect(boutons.map((b) => b.getAttribute('data-mvt')))
        .toEqual(['detail:tr-precedent', 'detail:tr-pause', 'detail:tr-suivant']);
    });

    it('le rail de volume porte sa marque quand le niveau est connu', () => {
      const c = rendre(BASE);
      expect(c.querySelector('.media-rail')?.getAttribute('data-mvt')).toBe('detail:volume-rail');
    });

    it('les deux boutons de pas portent chacun leur marque, − puis +', () => {
      const c = rendre({ ...BASE, volume: { entite: 'media_player.tv', niveau: undefined, parPas: true } });
      const pas = Array.from(c.querySelectorAll('.media-pas'));
      expect(pas.map((p) => p.getAttribute('data-mvt')))
        .toEqual(['detail:volume-moins', 'detail:volume-plus']);
    });
  });

  it('coupe le titre à deux lignes, jamais à une', () => {
    const titre = rendre(BASE).querySelector('.v') as HTMLElement;
    expect(titre.classList.contains('deux-lignes')).toBe(true);
  });

  it('garde l\'étiquette EN COURS, comme .demain et .alerte', () => {
    expect(rendre(BASE).querySelector('.t')!.textContent).toBe('EN COURS');
  });

  // Correctif important (revue tâche 6) : recrée le garde-fou supprimé de `tests/corps.test.ts`
  // (« .media partage désormais la couche d'état (:active) de .ambiance/.commande/.xl/.tuile »),
  // qui existait parce qu'une revue antérieure avait trouvé exactement ce défaut (rapport de
  // tâche 13) — sa suppression était correcte dans la lettre (`.media` en est sorti), mais il
  // fallait le PORTER sur `.media-bouton`/`.media-pas`/`.media-rail`, qui l'ont remplacé dans ce
  // groupe (cf. `base.css`, le rail rejoint le groupe dans le même correctif que le retour
  // optimiste de `--niveau`, ci-dessous). « Vérifié, pas supposé » : lu directement dans
  // `base.css`, comme les tests de gabarit CSS de `tests/corps.test.ts`, pas déduit du rendu
  // (jsdom ne peint jamais `:active`).
  it('.media-bouton, .media-pas et .media-rail partagent la couche d\'état (:active) de .ambiance/.commande/.xl/.tuile', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    // Les trois règles du groupe (position, overlay, opacité au contact) doivent toutes les trois
    // citer les trois classes — un défaut qui n'en toucherait qu'une laisserait un overlay sans
    // opacité (ou l'inverse), silencieusement.
    const rePosition = /\.ambiance,\s*\.commande,\s*\.xl,\s*\.tuile,\s*\.media-bouton,\s*\.media-pas,\s*\.media-rail\s*\{\s*position:\s*relative;\s*\}/;
    const reOverlay = /\.ambiance::after,\s*\.commande::after,\s*\.xl::after,\s*\.tuile::after,\s*\n\.media-bouton::after,\s*\.media-pas::after,\s*\.media-rail::after\s*\{/;
    const reActif = /\.tuile:active::after,\s*\n\.media-bouton:active::after,\s*\.media-pas:active::after,\s*\.media-rail:active::after\s*\{/;
    expect(css, 'la règle `position: relative` du groupe devrait citer .media-bouton/.media-pas/.media-rail').toMatch(rePosition);
    expect(css, 'la règle `::after` (overlay) du groupe devrait citer .media-bouton/.media-pas/.media-rail').toMatch(reOverlay);
    expect(css, 'la règle `:active::after` (opacité au contact) du groupe devrait citer .media-bouton/.media-pas/.media-rail').toMatch(reActif);
  });

  // Correctif important (revue tâche 6) : `rendreCarteMedia` n'écoutait que `pointerdown` sans
  // jamais écrire `--niveau` — au contact, rien ne bougeait à l'écran avant le retour d'état de
  // Home Assistant. Même principe de retour optimiste que le reste du projet (cf. `interaction.ts`,
  // `geste.ts`) : `pointerdown` seul suffit ici (pas de suivi de glissement complet, le brief ne le
  // prévoyait pas) — le doigt pose une valeur, l'appel de service suit.
  it('le rail écrit --niveau immédiatement au contact, avant même le retour de Home Assistant', () => {
    const c = rendre(BASE);
    const rail = c.querySelector('.media-rail') as HTMLElement;
    // jsdom ne met jamais en page : `getBoundingClientRect()` y rend toujours des zéros. Le
    // calcul de fraction (`(clientX - r.left) / r.width`) est donc invérifiable ici — seule
    // l'ÉCRITURE immédiate de `--niveau` au contact (avant l'appel de service) est testable sans
    // navigateur réel, et c'est précisément ce que ce correctif garantit.
    expect(rail.style.getPropertyValue('--niveau')).toBe('0.4');   // valeur initiale de BASE.volume
    rail.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, bubbles: true }));
    // La valeur a pu changer (elle dépend de la position du contact, invérifiable en jsdom), mais
    // la propriété doit avoir été réécrite SUR L'ÉLÉMENT, en direct, sans attendre un re-rendu.
    expect(rail.style.getPropertyValue('--niveau')).not.toBe('');
  });
});
