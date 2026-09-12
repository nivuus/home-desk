// @vitest-environment jsdom
//
// Tâche 12 : le CÂBLAGE. Chacun des modules construits par les onze tâches précédentes est
// correct pris isolément (`tests/media.test.ts`, `tests/modes.test.ts`, `tests/agenda.test.ts`,
// `tests/carte-media.test.ts`, `tests/rendu-modes.test.ts`, `tests/delorean.test.ts`,
// `tests/mouvement.test.ts`) — et aucun de ces tests ne peut voir qu'ils ne sont appelés par
// personne. C'est exactement la classe de défaut que cette suite existe pour attraper : elle
// monte le vrai `demarrer()`, pousse des états comme le ferait le websocket, et regarde ce que
// `#app` porte réellement.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ECRANS } from '../src/ecran';
import type { Prevision } from '../src/meteo';
import { monterDemarrage, restaurerReseau, vider } from './aides';
import { DUREES_DELOREAN } from '../src/rendu/delorean';

afterEach(() => { restaurerReseau(); });

const AUJOURD_HUI: Prevision = { datetime: '2026-08-01T12:00:00', condition: 'sunny', temperature: 30 };
const DEMAIN: Prevision = { datetime: '2026-08-02T12:00:00', condition: 'rainy', temperature: 35 };
/** La prévision quotidienne telle que HA la rend : le jour courant d'abord, puis les suivants. */
const QUOTIDIEN = [AUJOURD_HUI, DEMAIN];

/** Le 1er août 2026 à 14 h — même instant que le défaut de `monterDemarrage`, redit ici pour que
 *  les dates d'événements des tests d'agenda se lisent sans remonter dans `aides.ts`. */
const AUJOURDHUI = '2026-08-01';
const DEMAIN_DATE = '2026-08-02';

describe('orchestration des modes', () => {
  it('rend la carte média quand une source joue, à la place du bloc voiture', async () => {
    const { racine, pousser } = await monterDemarrage(ECRANS.salon);
    // Tâche 9 bis (2026-08-03) : le salon déclare désormais une voiture, donc son bloc par défaut
    // est `.voiture` et non plus `.prevision` (demande du propriétaire — les six prochaines heures
    // ont quitté cet écran, définitivement supprimées à la tâche 14). `.prevision` n'y apparaît
    // donc plus jamais, sur AUCUN état ; c'est `.voiture` qui occupe la place tant que rien de
    // plus prioritaire n'arrive — sans cette première assertion, le test suivant passerait aussi
    // avec un écran vide.
    expect(racine.querySelector('.voiture')).not.toBeNull();
    expect(racine.querySelector('.prevision')).toBeNull();

    await pousser('media_player.musique_salon', 'playing', {
      media_title: 'Blinding Lights', media_artist: 'The Weeknd',
      supported_features: 1 | 16384 | 4, volume_level: 0.5,
    });

    expect(racine.querySelector('.media')).not.toBeNull();
    expect(racine.querySelector('.media .v')?.textContent).toContain('Blinding Lights');
    expect(racine.querySelector('.voiture')).toBeNull();
  });

  it('rend le mode cinéma et force la palette sombre en plein jour quand la TV est allumée', async () => {
    const { racine, pousser } = await monterDemarrage(ECRANS.salon);
    await pousser('sun.sun', 'above_horizon');   // plein jour : sans le mode cinéma, `.sombre` est absente
    expect(racine.classList.contains('sombre')).toBe(false);

    await pousser('media_player.televiseur_salon_3', 'on', { app_name: 'Plex', supported_features: 153529 });

    expect(racine.classList.contains('sombre')).toBe(true);
    // Écran allumé sans lecture en cours : la carte est là, avec le nom de l'application faute de
    // titre — c'est la distinction `allumee` / `joue` de `media.ts`, exercée ici de bout en bout.
    expect(racine.querySelector('.media .v')?.textContent).toContain('Plex');
  });

  it('rend le bloc ménage quand l\'aspirateur tourne, même si la TV est allumée', async () => {
    const { racine, pousser } = await monterDemarrage(ECRANS.salon);
    await pousser('media_player.televiseur_salon_3', 'on', { supported_features: 153529 });
    await pousser('vacuum.aspirateur_cuisine', 'cleaning', { battery_level: 60 });
    // Le bloc média est désormais marqué `data-mvt` (tâche 7) : le quitter produit une vraie
    // sortie animée, donc un fantôme temporaire dans `#mvt-fantomes` (descendant de `racine`)
    // avant que son `finished` (stub de `tests/setup-animate.ts`, résolu au microtask suivant) ne
    // le relâche — comme pour toute sortie de ce moteur, jamais une disparition instantanée.
    await Promise.resolve(); await Promise.resolve();

    expect(racine.querySelector('.mode-bloc .t')?.textContent).toContain('Ménage');
    expect(racine.querySelector('.media')).toBeNull();
  });

  it('rend le bloc aération quand un ouvrant est ouvert depuis plus de 10 min et que le chauffage chauffe', async () => {
    // Horloge figée : `Etat.appliquer` horodate avec `Date.now()`, `dessiner()` lit le
    // `maintenant` injecté — les deux doivent venir de la même horloge, sinon « ouvert depuis »
    // vaut n'importe quoi.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
      const { racine, pousser } = await monterDemarrage(ECRANS.salon, { maintenant: () => new Date() });
      await pousser('binary_sensor.porte_balcon_s_ouverture', 'on',
              { friendly_name: 'Porte balcon (S) Ouverture' });
      expect(racine.querySelector('.mode-bloc')).toBeNull();   // 0 min : rien à signaler encore

      vi.setSystemTime(new Date(2026, 7, 1, 14, 11));
      await pousser('climate.radiateur', 'heat');   // 11 min plus tard, et le chauffage tourne

      expect(racine.querySelector('.mode-bloc .t')?.textContent).toContain('Ouvert');
      expect(racine.querySelector('.mode-bloc .v')?.textContent).toContain('Porte balcon');
      expect(racine.querySelector('.alerte')).toBeNull();   // une aération n'est jamais une alerte
    } finally {
      vi.useRealTimers();
    }
  });

  it('une alerte prime encore sur tout', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
      const { racine, pousser } = await monterDemarrage(ECRANS.salon, { maintenant: () => new Date() });
      await pousser('vacuum.aspirateur_cuisine', 'cleaning', {});
      await pousser('binary_sensor.tablette_salon_mouvement', 'on', {});   // la maison bouge
      await pousser('lock.aqara_smart_lock_u200_lite', 'unlocked', {});
      // Le bloc ménage sort réellement (remplacé par l'alerte), mais le moteur de mouvement
      // (`src/mouvement/moteur.ts`) anime cette sortie sur un CLONE dans `#mvt-fantomes`, qui
      // porte encore la classe `.mode-bloc` au-delà du redessin déclenché par `pousser()`, le
      // temps qu'il se relâche.
      await vider();

      expect(racine.querySelector('.alerte')?.textContent).toContain('Porte déverrouillée');
      expect(racine.querySelector('.mode-bloc')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hors ligne prime sur l\'alerte, comme avant', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
      const { racine, pousser, silence } = await monterDemarrage(ECRANS.salon, {
        maintenant: () => new Date(),
      });
      await pousser('lock.aqara_smart_lock_u200_lite', 'unlocked', {});
      await pousser('binary_sensor.tablette_salon_mouvement', 'on', {});
      expect(racine.querySelector('.alerte')).not.toBeNull();

      silence(40_000);
      // Cf. commentaire du test au-dessus : le clone de sortie de `.alerte` (moteur de mouvement)
      // met une microtâche à se relâcher.
      await vider();

      expect(racine.querySelector('.hors-ligne')).not.toBeNull();
      expect(racine.querySelector('.alerte')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // Tâche 8 (moteur de mouvement) : le niveau de mouvement ne s'exprime plus en CSS sur `#app` —
  // il vit DANS `creerMoteur` (`src/mouvement/moteur.ts`), fixé au montage depuis la tâche 1 du
  // chantier grammaire (`niveauDemande`, `src/mouvement.ts`), jamais comme une classe globale que
  // ce test pouvait lire depuis `demarrage.ts`. Gardé ici comme repère d'architecture plutôt que
  // supprimé en silence : `#app` ne porte plus AUCUNE classe `mvt-*`.
  it('ne pose plus de classe mvt-* sur #app (le niveau vit dans le moteur, pas en CSS)', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon);
    expect(Array.from(racine.classList).some((c) => c.startsWith('mvt-'))).toBe(false);
  });
});

describe('pastille du bandeau', () => {
  it('retombe sur « Demain » : la prévision quotidienne est bien rechargée', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon, { reseau: { quotidien: QUOTIDIEN } });
    expect(racine.querySelector('.pastille .pt')?.textContent).toBe('Demain');
    expect(racine.querySelector('.pastille .pv')?.textContent).toBe('35° et de la pluie');
  });

  it('affiche l\'anniversaire du jour', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon, {
      reseau: {
        quotidien: QUOTIDIEN,
        calendriers: {
          'calendar.anniversaires': [{ resume: 'Anniversaire de Julie', debut: `${AUJOURDHUI}T00:00:00` }],
        },
      },
    });
    expect(racine.querySelector('.pastille .pt')?.textContent).toBe('Aujourd\'hui');
    expect(racine.querySelector('.pastille .pv')?.textContent).toBe('Anniversaire de Julie');
  });

  it('n\'affiche JAMAIS un anniversaire de demain comme « Aujourd\'hui »', async () => {
    // La fenêtre interrogée fait 24 h : un anniversaire de demain arrive dans la même réponse que
    // celui du jour. Sans filtre côté chargement, il s'afficherait « Aujourd'hui ».
    const { racine } = await monterDemarrage(ECRANS.salon, {
      reseau: {
        quotidien: QUOTIDIEN,
        calendriers: {
          'calendar.anniversaires': [{ resume: 'Anniversaire de Paul', debut: `${DEMAIN_DATE}T00:00:00` }],
        },
      },
    });
    expect(racine.querySelector('.pastille .pt')?.textContent).toBe('Demain');
    expect(racine.textContent).not.toContain('Anniversaire de Paul');
  });

  it('affiche un rendez-vous des trois prochaines heures', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon, {
      reseau: {
        quotidien: QUOTIDIEN,
        calendriers: { 'calendar.personnel': [{ resume: 'Dentiste', debut: `${AUJOURDHUI}T15:30:00` }] },
      },
    });
    expect(racine.querySelector('.pastille .pt')?.textContent).toBe('15:30');
    expect(racine.querySelector('.pastille .pv')?.textContent).toBe('Dentiste');
  });

  it('le mode invités masque la pastille personnelle du bandeau', async () => {
    const { racine, pousser } = await monterDemarrage(ECRANS.salon, {
      reseau: {
        quotidien: QUOTIDIEN,
        calendriers: {
          'calendar.anniversaires': [{ resume: 'Anniversaire de Julie', debut: `${AUJOURDHUI}T00:00:00` }],
        },
      },
    });
    expect(racine.querySelector('.pastille .pt')?.textContent).toBe('Aujourd\'hui');

    await pousser('input_boolean.mode_invites', 'on', {});

    expect(racine.querySelector('.pastille .pt')?.textContent).toBe('Demain');
    expect(racine.textContent).not.toContain('Anniversaire de Julie');
  });
});

describe('actions des blocs de mode', () => {
  it('un appui sur pause appelle le service du lecteur qui porte le transport', async () => {
    const { racine, pousser, appelerService } = await monterDemarrage(ECRANS.salon);
    await pousser('media_player.musique_salon', 'playing',
            { media_title: 'Blinding Lights', supported_features: 1 });

    racine.querySelector('.media-bouton')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(appelerService).toHaveBeenCalledWith(
      'media_player', 'media_pause', { entity_id: 'media_player.musique_salon' });
  });

  it('un appui sur le rail de volume envoie le niveau visé', async () => {
    const { racine, pousser, appelerService } = await monterDemarrage(ECRANS.salon);
    await pousser('media_player.musique_salon', 'playing',
            { media_title: 'Blinding Lights', supported_features: 1 | 4, volume_level: 0.5 });

    racine.querySelector('.media-rail')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    const [domaine, service, donnees] = appelerService.mock.calls[0];
    expect([domaine, service]).toEqual(['media_player', 'volume_set']);
    expect(donnees).toHaveProperty('volume_level');
  });

  it('un appui sur « Ranger » renvoie l\'aspirateur à sa base', async () => {
    const { racine, pousser, appelerService } = await monterDemarrage(ECRANS.salon);
    await pousser('vacuum.aspirateur_cuisine', 'cleaning', { battery_level: 60 });

    racine.querySelector('.mode-action')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(appelerService).toHaveBeenCalledWith(
      'vacuum', 'return_to_base', { entity_id: 'vacuum.aspirateur_cuisine' });
  });

  it('hors ligne, aucune action ne part — même depuis un bloc encore affiché à l\'écran', async () => {
    const { racine, pousser, silence, appelerService } = await monterDemarrage(ECRANS.salon);
    await pousser('vacuum.aspirateur_cuisine', 'cleaning', { battery_level: 60 });
    // Le nœud est capturé AVANT la panne : hors ligne, `dessiner()` le remplace par le bandeau
    // « Hors ligne », mais un doigt déjà posé (ou un rendu que la dalle n'a pas encore repeint)
    // doit lui aussi se heurter au refus — c'est le rôle du garde dans `agir`, pas du rendu.
    const bouton = racine.querySelector('.mode-action')!;
    silence(40_000);

    bouton.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(appelerService).not.toHaveBeenCalled();
  });
});

describe('clin d\'œil DeLorean', () => {
  it('survole l\'écran le 21 octobre, comme descendant de #app', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon, {
      maintenant: () => new Date(2026, 9, 21, 14, 0),
    });
    const survol = racine.querySelector('.delorean');
    expect(survol).not.toBeNull();
    // Descendant de `#app`, jamais `document.body` : c'est de là que descendent les jetons de
    // couleur Material 3 (`.m3`) par héritage CSS — un survol posé ailleurs perdrait `--md-*`.
    expect(racine.contains(survol!)).toBe(true);
    expect(document.body.contains(survol!)).toBe(false);
  });

  // La durée dépend de la SCÈNE depuis le 2026-08-21 : 4 s pour la foudre, 6,5 s pour le voyage,
  // 8 s pour le saut complet des deux grandes dates. Elle vient de `DUREES_DELOREAN`, jamais
  // d'une constante écrite ici — sinon les deux valeurs dériveraient en silence.
  it('disparaît au bout de la durée de sa scène', async () => {
    const { racine, minuteurFn } = await monterDemarrage(ECRANS.salon, {
      maintenant: () => new Date(2026, 9, 21, 14, 0),
    });
    const retrait = minuteurFn.mock.calls.find(([, delai]) => delai === DUREES_DELOREAN.saut);
    expect(retrait).toBeDefined();

    (retrait![0] as () => void)();

    expect(racine.querySelector('.delorean')).toBeNull();
  });

  it('n\'apparaît pas un jour ordinaire', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon);
    expect(racine.querySelector('.delorean')).toBeNull();
  });

  // Revue tâche 12, constat 3 : `dessiner()` sortait par un retour anticipé dès `moment === 'nuit'`
  // (23 h → 5 h) AVANT le bloc d'armement du survol. 01 h 21 — l'un des quatre instants déclarés
  // par `estInstantDelorean` — était donc structurellement inatteignable, tout comme le 21 octobre
  // et le 5 novembre entre 23 h et 5 h. Le code promettait un clin d'œil qu'il ne pouvait pas
  // rendre.
  it('survole aussi l\'écran de nuit : 01 h 21 est par définition en pleine nuit', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon, {
      maintenant: () => new Date(2026, 7, 1, 1, 21),
    });
    expect(racine.querySelector('.nuit')).not.toBeNull();   // bien l'écran de nuit, pas l'accueil
    const survol = racine.querySelector('.delorean');
    expect(survol).not.toBeNull();
    expect(racine.contains(survol!)).toBe(true);
  });

  // Mineur (ronde de correction 1, tâche 8) : `niveauInitial !== 'aucun'` (`demarrage.ts`,
  // `survol()`) remplace l'ancienne règle CSS `.mvt-aucun .delorean { animation: none; opacity: 0 }`
  // — un changement introduit par cette même tâche, et resté sans test jusqu'ici (ni avant, ni
  // après). Le survol n'est désormais même plus RENDU sous ce refus (au lieu d'être rendu-et-masqué
  // en CSS), donc la preuve porte sur `.delorean`, jamais sur une classe ou un style calculé.
  it('mouvement=aucun (URL) : ne survole pas l\'écran, même le 21 octobre', async () => {
    const avantUrl = location.href;
    window.history.pushState({}, '', '/?mouvement=aucun');
    try {
      const { racine } = await monterDemarrage(ECRANS.salon, {
        maintenant: () => new Date(2026, 9, 21, 14, 0),
      });
      expect(racine.querySelector('.delorean')).toBeNull();
    } finally {
      window.history.pushState({}, '', avantUrl);
    }
  });
});

// Revue tâche 12 : trois comportements faux en production, chacun avec le test qui rougirait sur
// le défaut d'origine.
describe('arbitrage de la source affichée', () => {
  it('un film en cours prime sur une musique laissée en pause la veille', async () => {
    const { racine, pousser } = await monterDemarrage(ECRANS.salon);
    // `paused` compte comme « ça joue » (`ETATS_ACTIFS`) et « Musique » est déclarée AVANT
    // « Télévision » : retenir la première source non nulle affichait donc le dernier morceau
    // écouté, en plein film, sur un écran par ailleurs passé en mode cinéma.
    await pousser('media_player.musique_salon', 'paused',
            { media_title: 'Blinding Lights', media_artist: 'The Weeknd', supported_features: 1 });
    await pousser('media_player.televiseur_salon_3', 'on', { app_name: 'Plex', supported_features: 153529 });
    await pousser('media_player.plex_plex_for_android_tv_uhd_google_tv_stick', 'playing',
            { media_title: 'Retour vers le futur', supported_features: 131584 });
    // Le bloc média garde la même clé `data-mvt` (`bloc:media`) quelle que soit la source réelle
    // (tâche 7) : ce changement de titre est une MUTATION que le moteur croise, donc un fantôme
    // temporaire de l'ancien contenu avant que son `finished` (stub de `setup-animate.ts`,
    // résolu au microtask suivant) ne le relâche — jamais un remplacement instantané.
    await Promise.resolve(); await Promise.resolve();

    expect(racine.querySelector('.media .v')?.textContent).toContain('Retour vers le futur');
    expect(racine.textContent).not.toContain('Blinding Lights');
  });

  it('sans télévision allumée, la musique en pause garde la carte', async () => {
    // Le cas nominal ne doit pas être emporté par le correctif ci-dessus : hors mode cinéma,
    // c'est toujours la première source qui joue, dans l'ordre d'exclusivité déclaré.
    const { racine, pousser } = await monterDemarrage(ECRANS.salon);
    await pousser('media_player.musique_salon', 'paused',
            { media_title: 'Blinding Lights', supported_features: 1 });

    expect(racine.querySelector('.media .v')?.textContent).toContain('Blinding Lights');
  });
});

describe('palette du mode cinéma dans les sous-vues', () => {
  it('entrer dans « Toute la maison » pendant un film garde l\'écran sombre', async () => {
    const { racine, pousser } = await monterDemarrage(ECRANS.salon);
    await pousser('sun.sun', 'above_horizon');
    await pousser('media_player.televiseur_salon_3', 'on', { app_name: 'Plex', supported_features: 153529 });
    expect(racine.classList.contains('sombre')).toBe(true);

    try {
      location.hash = '#maison';
      window.dispatchEvent(new Event('hashchange'));

      expect(racine.querySelector('.grille')).not.toBeNull();   // bien la vue « Toute la maison »
      // Les retours anticipés précédaient le `add('sombre')` : la sous-vue rallumait l'écran en
      // plein salon, au milieu du film.
      expect(racine.classList.contains('sombre')).toBe(true);
    } finally {
      location.hash = '';
      window.dispatchEvent(new Event('hashchange'));
    }
  });
});

describe('choix de la prévision du lendemain', () => {
  it('prend la première entrée postérieure à aujourd\'hui, pas la deuxième de la liste', async () => {
    const { racine } = await monterDemarrage(ECRANS.salon, { reseau: { quotidien: QUOTIDIEN } });
    // 35°/pluie = demain ; 30°/soleil = aujourd'hui. Prendre `f[0]` afficherait le mauvais jour.
    expect(racine.querySelector('.pastille .pv')?.textContent).toBe('35° et de la pluie');
  });

  it('reste juste quand l\'intégration ne renvoie pas le jour courant', async () => {
    // Rien ne garantit que le jour courant soit en tête : Open-Meteo peut le laisser tomber en
    // fin de journée. `f[1]` annonçait alors « Demain » avec le SURLENDEMAIN, ou plus rien du tout.
    const { racine } = await monterDemarrage(ECRANS.salon, { reseau: { quotidien: [DEMAIN] } });
    expect(racine.querySelector('.pastille .pt')?.textContent).toBe('Demain');
    expect(racine.querySelector('.pastille .pv')?.textContent).toBe('35° et de la pluie');
  });
});
