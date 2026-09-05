import { describe, it, expect } from 'vitest';
import { Etat } from '../src/etat';
import { resoudreSource, vignetter, LARGEUR_AFFICHE, type DeclarationSource } from '../src/media';

/** Déclaration réelle de la source « Télévision » du salon : quatre entités, aucune ne sachant
 *  tout faire. Reproduite ici plutôt qu'importée de `pieces.ts` pour que ce test reste vrai même
 *  si la déclaration du salon change. */
const TELE: DeclarationSource = {
  nom: 'Télévision',
  allumee: { entite: 'media_player.televiseur_salon_3', etats: ['on', 'playing', 'paused'] },
  titre: ['media_player.plex_tv', 'media_player.televiseur_salon_2', 'media_player.televiseur_salon_3'],
  sousTitre: ['media_player.plex_tv', 'media_player.televiseur_salon_2', 'media_player.televiseur_salon_3'],
  affiche: ['media_player.plex_tv', 'media_player.televiseur_salon_2'],
  progression: ['media_player.plex_tv', 'media_player.televiseur_salon_2'],
  transport: ['media_player.televiseur_salon_3', 'media_player.televiseur_salon_2'],
  volume: ['media_player.televiseur_salon', 'media_player.televiseur_salon_3'],
};

function etatAvec(entites: Record<string, { etat: string; attributs: Record<string, unknown> }>): Etat {
  const e = new Etat();
  for (const [id, v] of Object.entries(entites)) {
    e.appliquer({ entity_id: id, state: v.etat, attributes: v.attributs });
  }
  return e;
}

/** L'affiche que Plex publie fait 2000x3000 px (~23 Mo décodés) et TUE la WebView des Fire 7 :
 *  boucle de redémarrage de Fully pendant toute la durée d'un film (mesuré le 2026-08-25). Ces
 *  tests gardent le passage par le redimensionneur — ce n'est pas une préférence de rendu. */
describe('vignetter', () => {
  it('fait passer une affiche servie par HA par /api/vignette', () => {
    expect(vignetter('/api/media_player_proxy/plex?token=abc'))
      .toBe('/api/vignette?w=400&url=%2Fapi%2Fmedia_player_proxy%2Fplex%3Ftoken%3Dabc');
  });

  it('encode l\'URL d\'origine, jetons et esperluettes compris', () => {
    const sortie = vignetter('/api/media_player_proxy/x?token=a&cache=b')!;
    // Une seule esperluette dans l'URL finale : celle qui sépare `w` de `url`. Sans encodage,
    // `cache=b` deviendrait un paramètre de `/api/vignette` et le relais perdrait le jeton.
    expect(sortie.split('&').length).toBe(2);
    expect(decodeURIComponent(sortie.split('url=')[1])).toBe('/api/media_player_proxy/x?token=a&cache=b');
  });

  it('demande une largeur qui couvre la boite de l\'affiche sans l\'approcher du seuil fatal', () => {
    expect(LARGEUR_AFFICHE).toBe(400);
    expect(vignetter('/api/image_proxy/cam')).toContain(`w=${LARGEUR_AFFICHE}`);
  });

  it('laisse passer une URL externe et l\'absence d\'affiche sans y toucher', () => {
    expect(vignetter('https://exemple.test/a.jpg')).toBe('https://exemple.test/a.jpg');
    expect(vignetter(undefined)).toBeUndefined();
  });
});

describe('resoudreSource', () => {
  it('prend le titre et l\'affiche sur Plex quand Plex joue', () => {
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'playing', attributs: {
        media_title: 'Les trois Mousquetaires', media_series_title: 'Ash vs Evil Dead',
        entity_picture: '/api/media_player_proxy/plex?token=abc',
        media_position: 8, media_duration: 1545, supported_features: 131584 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { app_name: 'Plex', supported_features: 153529 } },
      'media_player.televiseur_salon': { etat: 'on', attributs: { volume_level: 0.4, supported_features: 152461 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.titre).toBe('Les trois Mousquetaires');
    expect(s.sousTitre).toBe('Ash vs Evil Dead');
    // L'affiche ne sort JAMAIS telle quelle : elle passe par `/api/vignette` (cf. `vignetter`).
    expect(s.affiche).toBe(
      '/api/vignette?w=400&url=%2Fapi%2Fmedia_player_proxy%2Fplex%3Ftoken%3Dabc');
    expect(s.progression).toEqual(expect.objectContaining({ position: 8, duree: 1545 }));
  });

  it('prend le titre sur l\'entité Cast et n\'a aucune affiche quand YouTube joue', () => {
    const etat = etatAvec({
      'media_player.televiseur_salon_2': { etat: 'playing', attributs: {
        media_title: 'Nirmal Purja, la star de l\'alpinisme', media_artist: 'Le Parisien',
        media_position: 1.267, media_duration: 259.581, supported_features: 16435 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { app_name: 'YouTube', supported_features: 153529 } },
      'media_player.televiseur_salon': { etat: 'on', attributs: { volume_level: 1, supported_features: 152461 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.titre).toBe('Nirmal Purja, la star de l\'alpinisme');
    expect(s.sousTitre).toBe('Le Parisien');
    expect(s.affiche).toBeUndefined();
    expect(s.progression?.duree).toBeCloseTo(259.581);
  });

  it('donne le transport à la première entité qui déclare PAUSE, jamais à Plex', () => {
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'playing', attributs: { media_title: 'X', supported_features: 131584 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.transport?.entite).toBe('media_player.televiseur_salon_3');
    expect(s.transport?.peutPrecedent).toBe(true);
    expect(s.transport?.peutSuivant).toBe(true);
  });

  // Défaut constaté à l'écran le 2026-08-03 20:44 (film en cours, capture tablette salon) :
  // `media_player.plex_...` = `playing`, mais l'entité qui PORTE le transport
  // (`televiseur_salon_3`) ne vaut que `on` (un stick Google TV n'a pas de notion de lecture en
  // cours, seulement d'allumage). Le bouton central affichait ▶ (lecture) sur un film qui jouait
  // déjà — un appui aurait renvoyé un ordre de lecture à un lecteur en train de jouer. `enLecture`
  // doit se résoudre comme tout le reste du module : champ par champ, jamais sur la seule entité
  // qui porte le transport.
  it('enLecture vient du titre qui joue, pas de l\'entité de transport qui n\'est qu\'allumée', () => {
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'playing', attributs: {
        media_title: 'Mauvaise Pioche (2026)', media_position: 0, media_duration: 5504,
        supported_features: 131584 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { app_name: 'Plex', supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.transport?.enLecture).toBe(true);
  });

  it('enLecture redevient faux à la pause, même si le transport reste `on`', () => {
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'paused', attributs: {
        media_title: 'Mauvaise Pioche (2026)', media_position: 120, media_duration: 5504,
        supported_features: 131584 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { app_name: 'Plex', supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.transport?.enLecture).toBe(false);
  });

  it('donne le volume à la seule entité qui déclare VOLUME_SET', () => {
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'playing', attributs: { media_title: 'X', supported_features: 131584 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { supported_features: 153529 } },
      'media_player.televiseur_salon': { etat: 'on', attributs: { volume_level: 0.4, supported_features: 152461 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.volume).toEqual({ entite: 'media_player.televiseur_salon', niveau: 0.4, parPas: false });
  });

  it('retombe sur le réglage par pas quand aucune entité ne déclare VOLUME_SET', () => {
    const etat = etatAvec({
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { media_title: 'X', supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.volume).toEqual({ entite: 'media_player.televiseur_salon_3', niveau: undefined, parPas: true });
  });

  // Revue tâche 12 : `allumee` était recalculé à l'identique dans `demarrage.ts` à partir de la
  // déclaration. Une règle métier à deux endroits finit par diverger — elle est exposée ici, à
  // l'endroit où elle est déjà décidée.
  it('expose `allumee` séparément de `joue` : un écran allumé sur un menu ne joue rien', () => {
    const etat = etatAvec({
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { app_name: 'Plex', supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.allumee).toBe(true);
    expect(s.joue).toBe(false);
  });

  it('une source qui joue sans déclaration `allumee` n\'est jamais dite allumée', () => {
    const MUSIQUE: DeclarationSource = {
      nom: 'Musique', titre: ['media_player.ytm'], sousTitre: ['media_player.ytm'],
      affiche: ['media_player.ytm'], progression: ['media_player.ytm'],
      transport: ['media_player.ytm'], volume: ['media_player.ytm'],
    };
    const etat = etatAvec({
      'media_player.ytm': { etat: 'playing', attributs: { media_title: 'X', supported_features: 1 } },
    });
    const s = resoudreSource(etat, MUSIQUE)!;
    expect(s.joue).toBe(true);
    expect(s.allumee).toBe(false);
  });

  it('rend null quand rien n\'est allumé', () => {
    const etat = etatAvec({
      'media_player.televiseur_salon_3': { etat: 'off', attributs: { supported_features: 153529 } },
    });
    expect(resoudreSource(etat, TELE)).toBeNull();
  });

  it('saute une entité indisponible sans perdre les autres champs', () => {
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'unavailable', attributs: {} },
      'media_player.televiseur_salon_2': { etat: 'playing', attributs: { media_title: 'Repli', supported_features: 16435 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.titre).toBe('Repli');
  });

  it('retombe sur app_name quand aucune entité n\'expose de titre', () => {
    const etat = etatAvec({
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { app_name: 'Disney+', supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.titre).toBe('Disney+');
    expect(s.sousTitre).toBe('');
  });
});

// Revue tâche 15, constat I1 : sans `media_position_updated_at`, le rail de progression ne peut
// pas être décompté côté navigateur — c'est l'instant du relevé, et lui seul, qui permet de
// rattraper le temps écoulé depuis la dernière publication de Home Assistant.
describe('resoudreSource — ce qu\'il faut au rail de progression (revue tâche 15, I1)', () => {
  it('remonte l\'instant du relevé et l\'état de lecture de l\'entité QUI PORTE la progression', () => {
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'playing', attributs: {
        media_title: 'Les trois Mousquetaires',
        media_position: 8, media_duration: 1545,
        media_position_updated_at: '2026-08-03T12:00:00+00:00',
        supported_features: 131584 } },
      'media_player.televiseur_salon_3': { etat: 'on', attributs: { supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.progression?.majLe).toBe(Date.parse('2026-08-03T12:00:00+00:00'));
    expect(s.progression?.avance).toBe(true);
  });

  it('avance = faux quand le lecteur est en pause, même si le transport est ailleurs', () => {
    // `avance` doit se lire sur l'entité de PROGRESSION, jamais sur celle du transport : au
    // salon, le transport vit sur le stick Google TV pendant que la progression vient de Plex.
    const etat = etatAvec({
      'media_player.plex_tv': { etat: 'paused', attributs: {
        media_title: 'Les trois Mousquetaires',
        media_position: 8, media_duration: 1545,
        media_position_updated_at: '2026-08-03T12:00:00+00:00',
        supported_features: 131584 } },
      'media_player.televiseur_salon_3': { etat: 'playing', attributs: { supported_features: 153529 } },
    });
    const s = resoudreSource(etat, TELE)!;
    expect(s.progression?.avance).toBe(false);
  });

  it('laisse majLe indéfini plutôt que NaN quand l\'attribut est absent ou illisible', () => {
    // Un `majLe` NaN se propagerait en fraction NaN, donc en `--progression: NaN` : le rail
    // disparaîtrait sans que rien ne le signale.
    for (const attribut of [{}, { media_position_updated_at: 'pas une date' }]) {
      const etat = etatAvec({
        'media_player.plex_tv': { etat: 'playing', attributs: {
          media_title: 'X', media_position: 8, media_duration: 1545, ...attribut } },
        'media_player.televiseur_salon_3': { etat: 'on', attributs: { supported_features: 153529 } },
      });
      const s = resoudreSource(etat, TELE)!;
      expect(s.progression?.majLe, JSON.stringify(attribut)).toBeUndefined();
    }
  });
});
