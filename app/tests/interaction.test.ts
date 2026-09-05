import { describe, it, expect, vi } from 'vitest';
import { Etat } from '../src/etat';
import { creerAppui, etatVise } from '../src/interaction';

describe('etatVise', () => {
  it('inverse sur un toggle', () => {
    expect(etatVise('off', ['light', 'toggle'])).toBe('on');
    expect(etatVise('on', ['light', 'toggle'])).toBe('off');
  });
  it('force sur turn_on et turn_off', () => {
    expect(etatVise('off', ['light', 'turn_on'])).toBe('on');
    expect(etatVise('on', ['light', 'turn_off'])).toBe('off');
  });
  it('laisse tel quel une scène, qui n a pas d état', () => {
    expect(etatVise('unknown', ['scene', 'turn_on'])).toBe('unknown');
  });

  // Cas ajouté : la première mouture (celle du brief) ne regardait que le service (`action`),
  // jamais le domaine — `if (action === 'turn_on') return 'on'` s'appliquait donc aussi bien à
  // `['scene', 'turn_on']` qu'à `['light', 'turn_on']`, ce qui contredisait le test ci-dessus
  // (« laisse tel quel une scène ») et n'était détectable qu'en exécutant vraiment ce cas-là.
  // Ce test isole explicitement l'angle mort : un `turn_on`/`turn_off`/`toggle` sur un domaine
  // absent de `DOMAINES_MARCHE_ARRET` ne doit JAMAIS viser 'on'/'off', quel que soit l'état de
  // départ — condition nécessaire pour que le point 4 du brief (« le retour arrière ne doit pas
  // éteindre à tort une tuile de scène qui n'avait jamais changé d'état ») soit vrai
  // structurellement, pas par coïncidence.
  it('un domaine sans notion marche/arrêt ignore aussi turn_off et toggle, pas seulement turn_on', () => {
    expect(etatVise('2026-08-01T10:00:00+00:00', ['scene', 'turn_on'])).toBe('2026-08-01T10:00:00+00:00');
    expect(etatVise('idle', ['script', 'turn_on'])).toBe('idle');
    expect(etatVise('unknown', ['button', 'turn_on'])).toBe('unknown');
  });

  // Ronde de correction 1 (CRITIQUE, trouvé par le relecteur) : la première version de cette
  // liste énumérait les domaines SANS état marche/arrêt (une liste noire), ce qui laissait tout
  // domaine oublié — dont `cover`, bien réel dans `pieces.ts` (`cover.rideau_cuisine`) — retomber
  // sur le traitement générique `on`/`off`/`toggle`. Un volet n'est jamais `on` ou `off` (ses
  // états sont `open`/`closed`/`opening`/`closing`) : `etatVise('closed', ['cover', 'toggle'])`
  // visait donc `'on'`, une valeur qu'aucun `cover.*` ne prend jamais. La liste est maintenant
  // blanche (`DOMAINES_MARCHE_ARRET = {'light', 'switch'}`) : un domaine absent ne vise rien, par
  // défaut — sûr, plutôt qu'inventé.
  // Tâche 19 (2026-08-03) : `fan` rejoint `DOMAINES_MARCHE_ARRET`. Un ventilateur/purificateur HA
  // a bien les états `on`/`off` (FanEntity), donc un `toggle` y vise un état représentable — sans
  // cette entrée, les deux nouvelles tuiles n'auraient posé AUCUN retour optimiste : le libellé
  // serait resté « En marche » une à trois secondes après l'appui, le temps que HA confirme,
  // c'est-à-dire très exactement l'appui qui semble ignoré que ce projet existe pour supprimer.
  it('un ventilateur (fan) vise bien on/off : c\'est un domaine marche/arrêt', () => {
    expect(etatVise('off', ['fan', 'toggle'])).toBe('on');
    expect(etatVise('on', ['fan', 'toggle'])).toBe('off');
    expect(etatVise('off', ['fan', 'turn_on'])).toBe('on');
    expect(etatVise('on', ['fan', 'turn_off'])).toBe('off');
  });

  it('un volet (cover) ne vise jamais on/off — ses états sont open/closed, pas un domaine marche/arrêt', () => {
    expect(etatVise('closed', ['cover', 'toggle'])).toBe('closed');
    expect(etatVise('open', ['cover', 'toggle'])).toBe('open');
    expect(etatVise('closed', ['cover', 'turn_on'])).toBe('closed');
    expect(etatVise('open', ['cover', 'turn_off'])).toBe('open');
  });
});

describe('creerAppui', () => {
  const bouton: any = { libelle: 'Lumières', icone: 'bulb',
                        entite: 'light.salon', service: ['light', 'toggle'] };

  it('repeint immédiatement, avant toute réponse de HA', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'light.salon', state: 'off', attributes: {} });
    const cx: any = { appelerService: vi.fn() };
    creerAppui(etat, cx, setTimeout)(etat, bouton);
    expect(etat.lire('light.salon')!.etat).toBe('on');
    expect(cx.appelerService).toHaveBeenCalledWith('light', 'toggle', { entity_id: 'light.salon' });
  });

  it('revient à l état réel si HA n a pas confirmé en trois secondes', () => {
    vi.useFakeTimers();
    const etat = new Etat();
    etat.appliquer({ entity_id: 'light.salon', state: 'off', attributes: {} });
    creerAppui(etat, { appelerService: vi.fn() } as any, setTimeout)(etat, bouton);
    expect(etat.lire('light.salon')!.etat).toBe('on');
    vi.advanceTimersByTime(3100);
    expect(etat.lire('light.salon')!.etat).toBe('off');
    vi.useRealTimers();
  });

  it('ne revient pas en arrière si HA a confirmé entre-temps', () => {
    vi.useFakeTimers();
    const etat = new Etat();
    etat.appliquer({ entity_id: 'light.salon', state: 'off', attributes: {} });
    creerAppui(etat, { appelerService: vi.fn() } as any, setTimeout)(etat, bouton);
    etat.appliquer({ entity_id: 'light.salon', state: 'on', attributes: {} });
    vi.advanceTimersByTime(3100);
    expect(etat.lire('light.salon')!.etat).toBe('on');
    vi.useRealTimers();
  });

  // Cas ajouté (point 4 du brief) : une scène n'a pas d'état marche/arrêt. `scene.turn_on`
  // appelle bien le service (l'ambiance doit s'activer), mais ne doit jamais poser d'état
  // optimiste ni, a fortiori, l'éteindre trois secondes plus tard — il n'y a jamais rien eu
  // d'« allumé » à éteindre. Le service continue d'être appelé (side effect réel), seul le
  // suivi d'état est court-circuité.
  it('un bouton de scène appelle le service mais ne pose ni n annule jamais d état optimiste', () => {
    vi.useFakeTimers();
    const etat = new Etat();
    etat.appliquer({ entity_id: 'scene.salon_clair', state: '2026-07-31T22:00:00+00:00', attributes: {} });
    const cx: any = { appelerService: vi.fn() };
    const boutonScene: any = { libelle: 'Clair', icone: 'sofa',
                                entite: 'scene.salon_clair', service: ['scene', 'turn_on'] };
    creerAppui(etat, cx, setTimeout)(etat, boutonScene);

    expect(cx.appelerService).toHaveBeenCalledWith('scene', 'turn_on', { entity_id: 'scene.salon_clair' });
    // Inchangé tout de suite : rien à afficher comme « actif » pour une scène.
    expect(etat.lire('scene.salon_clair')!.etat).toBe('2026-07-31T22:00:00+00:00');
    expect(etat.confirme('scene.salon_clair')).toBe(true);

    vi.advanceTimersByTime(3100);
    // Toujours inchangé après le délai : pas de retour arrière fantôme.
    expect(etat.lire('scene.salon_clair')!.etat).toBe('2026-07-31T22:00:00+00:00');
    vi.useRealTimers();
  });

  // Cas ajouté : une tuile purement informative (ex. `climate.radiateur`, cf. `pieces.ts`) n'a
  // pas de champ `service` du tout. L'appui ne doit rien appeler et rien changer.
  it('un bouton sans service ne fait rien (tuile informative)', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'climate.radiateur', state: 'heat', attributes: {} });
    const cx: any = { appelerService: vi.fn() };
    const boutonInfo: any = { libelle: 'Chauffage', icone: 'flame', entite: 'climate.radiateur' };
    creerAppui(etat, cx, setTimeout)(etat, boutonInfo);
    expect(cx.appelerService).not.toHaveBeenCalled();
    expect(etat.lire('climate.radiateur')!.etat).toBe('heat');
  });

  // Ronde de correction 1 (CRITIQUE, trouvé par le relecteur, prouvé par lui sur 10 appuis) :
  // sans dédoublonnage, chaque appui armait un minuteur de retour arrière indépendant, sans
  // jamais annuler celui du précédent. Sans confirmation HA (coordinateur Zigbee muet, arrivé
  // plusieurs fois dans cette maison), les N minuteurs s'exécutaient les uns après les autres,
  // chacun reposant un état optimiste — la tuile pouvait donc basculer plusieurs fois, toute
  // seule, dans les secondes suivant le dernier appui : exactement l'inverse de ce que cette
  // tâche existe pour corriger (l'utilisateur réappuie parce que l'écran ne semble pas répondre).
  // Ce test appuie 10 fois de suite sur la même entité et vérifie qu'un SEUL minuteur reste
  // vivant à la fois (`vi.getTimerCount()`) — pas seulement que la valeur finale est plausible,
  // qui peut être trompeuse (cf. rapport : avec la FIFO de minuteurs à délai identique, la valeur
  // finale coïncide par hasard avec le comportement dédoublonné dans ce scénario précis ; c'est le
  // nombre de minuteurs vivants, pas la valeur finale, qui distingue empilement et dédoublonnage).
  // Tâche 8 bis : un bouton `lien` (le panneau `home_stock`…) doit naviguer immédiatement, sans
  // jamais appeler HA ni poser d'état optimiste — c'est une simple page autonome, pas une
  // commande. Ce fichier tourne en environnement `node` (pas jsdom, cf. tests/demarrage.test.ts),
  // d'où le double minimal de `location` : suffisant pour vérifier l'affectation faite par
  // `creerAppui`, sans dépendre d'un vrai DOM ni de la navigation (non implémentée par jsdom de
  // toute façon pour une URL absolue — testée ici au niveau qui ne dépend pas de cette limite).
  it('un bouton avec `lien` navigue via location.href, sans appeler de service ni poser d etat optimiste', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'sensor.home_stock_next_meal', state: '3', attributes: {} });
    const cx: any = { appelerService: vi.fn() };
    const boutonLien: any = { libelle: 'Recettes', icone: 'book', entite: 'sensor.home_stock_next_meal',
                              lien: '/home-stock' };
    const localisationFactice = { href: '' };
    const localisationOriginale = (globalThis as any).location;
    (globalThis as any).location = localisationFactice;
    try {
      creerAppui(etat, cx, setTimeout)(etat, boutonLien);
      expect(localisationFactice.href).toBe('/home-stock');
      expect(cx.appelerService).not.toHaveBeenCalled();
      expect(etat.lire('sensor.home_stock_next_meal')!.etat).toBe('3');   // inchangé : rien n est optimiste ici
    } finally {
      (globalThis as any).location = localisationOriginale;
    }
  });

  it('des appuis rapprochés sur la même entité n arment jamais plus d un retour arrière à la fois', () => {
    vi.useFakeTimers();
    const etat = new Etat();
    etat.appliquer({ entity_id: 'light.salon', state: 'off', attributes: {} });
    const appui = creerAppui(etat, { appelerService: vi.fn() } as any, setTimeout);

    for (let i = 0; i < 10; i++) appui(etat, bouton);

    // Dix appuis, mais chacun doit avoir annulé le minuteur du précédent : un seul survit.
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(3100);
    // Sans aucune confirmation HA, le seul minuteur restant (celui du 10e appui) revient sur
    // son propre état de départ (celui affiché juste avant le 10e appui) — un seul mouvement,
    // pas une cascade de plusieurs.
    expect(etat.lire('light.salon')!.etat).toBe('on');
    vi.useRealTimers();
  });

  // Complément du test précédent : la confirmation HA reste prioritaire même après plusieurs
  // appuis rapprochés (règle de conception 3, déjà couverte pour un seul appui — vérifiée ici
  // spécifiquement dans le cas à risque : plusieurs appuis, donc plusieurs `avant` différents en
  // jeu, et un seul minuteur en vol au moment de la confirmation).
  it('une confirmation HA après plusieurs appuis rapprochés efface bien la marque optimiste', () => {
    vi.useFakeTimers();
    const etat = new Etat();
    etat.appliquer({ entity_id: 'light.salon', state: 'off', attributes: {} });
    const appui = creerAppui(etat, { appelerService: vi.fn() } as any, setTimeout);

    for (let i = 0; i < 3; i++) appui(etat, bouton);   // off -> on -> off -> on (affiché : 'on')
    etat.appliquer({ entity_id: 'light.salon', state: 'on', attributes: {} });   // HA confirme

    vi.advanceTimersByTime(3100);
    expect(etat.lire('light.salon')!.etat).toBe('on');
    vi.useRealTimers();
  });

  // Tâche 9, ronde de correction 1 (retour du coordinateur, IMPORTANT) : sans ce garde, un appui
  // pendant une panne de connexion silencieuse posait quand même l'état optimiste — la tuile
  // « Serrure » de la vue « Toute la maison » passait à « verrouillée » alors que rien n'était
  // parti, avant de revenir en arrière trois secondes plus tard sur un écran déjà quitté. Preuve
  // directe : ni l'état optimiste, ni l'appel de service n'ont lieu quand `estHorsLigne()` rend
  // vrai — sans dépendre du minuteur de retour (dont on prouve ici l'absence d'armement).
  it('estHorsLigne() vrai : aucun optimisme, aucun appel de service, pour une commande reelle', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'light.salon', state: 'off', attributes: {} });
    const appelerService = vi.fn();
    const appui = creerAppui(etat, { appelerService }, setTimeout, () => true);

    appui(etat, bouton);

    expect(etat.lire('light.salon')!.etat).toBe('off');   // jamais passé à 'on'
    expect(etat.confirme('light.salon')).toBe(true);      // aucune marque optimiste posée
    expect(appelerService).not.toHaveBeenCalled();
  });

  it('estHorsLigne() vrai : une tuile purement informative (sans service) reste consultable, rien a empecher', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'climate.radiateur', state: 'heat', attributes: {} });
    const appelerService = vi.fn();
    const boutonInfo: any = { libelle: 'Chauffage', icone: 'flame', entite: 'climate.radiateur' };
    const appui = creerAppui(etat, { appelerService }, setTimeout, () => true);

    expect(() => appui(etat, boutonInfo)).not.toThrow();
    expect(appelerService).not.toHaveBeenCalled();   // pas de service à appeler de toute façon
  });

  it('estHorsLigne() vrai : un bouton lien navigue quand meme, la navigation ne depend pas de HA', () => {
    const etat = new Etat();
    const appelerService = vi.fn();
    const boutonLien: any = { libelle: 'Recettes', icone: 'book', entite: 'sensor.home_stock_next_meal',
                               lien: '/local/wallpanel/recettes.html' };
    // Environnement `node` (pas jsdom), cf. commentaire du test « lien » ci-dessus : même double
    // minimal de `location`.
    const localisationFactice = { href: '' };
    const localisationOriginale = (globalThis as any).location;
    (globalThis as any).location = localisationFactice;
    try {
      creerAppui(etat, { appelerService }, setTimeout, () => true)(etat, boutonLien);
      expect(localisationFactice.href).toBe('/local/wallpanel/recettes.html');
    } finally {
      (globalThis as any).location = localisationOriginale;
    }
  });

  // Tâche 6 (2026-08-17) : `vue` (sous-vue interne, ex. « Recette ») est traité AVANT `lien` et
  // avant tout `service` — aucun appel HA, aucun optimisme, et (contrairement à `service`) sans
  // dépendre de `estHorsLigne()` : consulter une recette reste possible quand la maison ne répond
  // plus. Même double minimal de `location` que les tests `lien` ci-dessus (environnement `node`,
  // pas de vrai `location` global ici).
  it('un bouton `vue` pose le hash sans appeler aucun service', () => {
    const etat = new Etat();
    const cx = { appelerService: vi.fn() };
    const appui = creerAppui(etat, cx, setTimeout);
    const localisationFactice = { hash: '' };
    const localisationOriginale = (globalThis as any).location;
    (globalThis as any).location = localisationFactice;
    try {
      appui(etat, { libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal', vue: '#recette' } as any);
      expect(localisationFactice.hash).toBe('#recette');
      expect(cx.appelerService).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).location = localisationOriginale;
    }
  });

  // Tâche 5 (2026-08-02) : Porte et Rideau du salon affichent l'état de `lock.*`/`cover.*` mais
  // appellent un script (`pieces.ts`, champ `cible`). Le service doit viser `cible`, jamais
  // `entite` — sans quoi HA recevrait un `turn_on` sur la serrure elle-même, qui n'a pas ce
  // service. Pas de fabrique `monterAppui`/`cx.appels` dans ce fichier : on suit le même patron
  // que les tests `creerAppui` ci-dessus (`Etat` réel + double `{ appelerService: vi.fn() }`).
  it('appelle le script quand une commande déclare une cible, jamais l entité affichée', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'lock.serrure', state: 'locked', attributes: {} });
    const cx: any = { appelerService: vi.fn() };
    const boutonPorte: any = { libelle: 'Porte', icone: 'porte', entite: 'lock.serrure',
                                service: ['script', 'turn_on'], cible: 'script.ouvrir' };

    creerAppui(etat, cx, setTimeout)(etat, boutonPorte);

    expect(cx.appelerService).toHaveBeenCalledWith('script', 'turn_on', { entity_id: 'script.ouvrir' });
    // `script` est absent de `DOMAINES_MARCHE_ARRET` : aucun état n'est visé pour ce couple
    // [domaine, action], donc `etat.optimiste` n'est jamais appelé ici — mais si un jour un
    // domaine visé devient marche/arrêt, c'est bien `lock.serrure` (l'entité affichée) qui
    // devrait porter la marque, jamais `script.ouvrir` (qui n'a pas d'état exploitable).
    expect(etat.lire('lock.serrure')!.etat).toBe('locked');
    expect(etat.confirme('lock.serrure')).toBe(true);
    expect(etat.lire('script.ouvrir')).toBeUndefined();
  });

  it('estHorsLigne() faux (comportement par defaut, retro-compatible) : l optimisme fonctionne normalement', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'light.salon', state: 'off', attributes: {} });
    const appui = creerAppui(etat, { appelerService: vi.fn() }, setTimeout);   // 4e argument omis

    appui(etat, bouton);

    expect(etat.lire('light.salon')!.etat).toBe('on');
  });
});
