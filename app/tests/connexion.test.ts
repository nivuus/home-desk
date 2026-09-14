import { describe, it, expect, vi } from 'vitest';
import { Connexion, RefusHA, lireJetons, doitRafraichir, rafraichir, delaiReconnexion } from '../src/connexion';

const faux = (contenu: string | null) => ({ getItem: () => contenu, setItem: vi.fn() } as any);

describe('lireJetons', () => {
  it('lit hassTokens, posé par le frontend HA sur la même origine', () => {
    const j = { access_token: 'a', refresh_token: 'r', expires: 42, clientId: 'c' };
    expect(lireJetons(faux(JSON.stringify(j)))).toEqual(j);
  });

  it('rend null si la session n a jamais été ouverte', () => {
    expect(lireJetons(faux(null))).toBeNull();
  });

  it('rend null sur un contenu illisible plutôt que de lever', () => {
    expect(lireJetons(faux('{pas du json'))).toBeNull();
  });
});

describe('doitRafraichir', () => {
  const j: any = { expires: 1_000_000 };

  it('rafraîchit cinq minutes avant expiration', () => {
    expect(doitRafraichir(j, 1_000_000 - 4 * 60_000)).toBe(true);
    expect(doitRafraichir(j, 1_000_000 - 6 * 60_000)).toBe(false);
  });

  it('rafraîchit une fois le jeton périmé', () => {
    expect(doitRafraichir(j, 1_000_001)).toBe(true);
  });

  it('rafraîchit à la frontière exacte : il reste précisément cinq minutes', () => {
    // Ronde de correction 1 : `>` au lieu de `>=` laissait passer tous les tests précédents,
    // qui ne touchaient jamais la marge pile (seulement 4 min et 6 min avant expiration).
    expect(doitRafraichir(j, 1_000_000 - 5 * 60_000)).toBe(true);
  });
});

describe('rafraichir', () => {
  it('échange le jeton de rafraîchissement et recalcule expires', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ access_token: 'neuf', expires_in: 1800 }),
    }) as any;
    const j: any = { access_token: 'vieux', refresh_token: 'r', expires: 0, clientId: 'c' };
    const res = await rafraichir(j, fetchFn, 1_000_000);
    expect(res.access_token).toBe('neuf');
    expect(res.expires).toBe(1_000_000 + 1800 * 1000);
    expect(res.refresh_token).toBe('r');   // conservé, HA ne le renvoie pas
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('/auth/token');
    expect(String(opts.body)).toContain('grant_type=refresh_token');
  });

  it('lève si HA refuse, pour que l appelant réaffiche l écran de session', async () => {
    // Ronde de correction 1 : le double doit avoir un `json` qui fonctionne, sinon le test
    // passait pour la mauvaise raison — une TypeError accidentelle (`rep.json is not a
    // function`) plutôt que le refus métier. On vérifie le message précis levé par le code.
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }),
    }) as any;
    const j: any = { refresh_token: 'r', clientId: 'c', expires: 0, access_token: '' };
    await expect(rafraichir(j, fetchFn, 0)).rejects.toThrow('Rafraîchissement refusé : 400');
  });
});

describe('delaiReconnexion', () => {
  it('croît de 1 s à 30 s et plafonne', () => {
    expect(delaiReconnexion(0)).toBe(1000);
    expect(delaiReconnexion(1)).toBe(2000);
    expect(delaiReconnexion(4)).toBe(16000);
    expect(delaiReconnexion(5)).toBe(30000);
    expect(delaiReconnexion(50)).toBe(30000);
  });
});

// Faux websocket minimal : suffisant pour la portion de `connecter()` qui l'utilise
// (assignation de `onmessage`/`onclose`, `send`), sans jamais ouvrir de connexion réelle.
class FauxWebSocket {
  onmessage: ((ev: any) => void) | null = null;
  onclose: (() => void) | null = null;
  send() {}
  constructor(public url: string) {}
}

describe('Connexion — surveillance du silence', () => {
  it('n arme le minuteur de silence qu une seule fois, même après plusieurs connecter()', async () => {
    // Ronde de correction 1 (CRITIQUE) : `connecter()` est rappelé par `ws.onclose` à chaque
    // reconnexion. Sans garde, chaque appel posait un `setInterval` supplémentaire — fuite
    // fatale sur une tablette à 130 Mo de libre qui décroche régulièrement du Wi-Fi.
    const intervalFn = vi.fn();
    const j: any = {
      access_token: 'a', refresh_token: 'r', clientId: 'c',
      expires: Date.now() + 60 * 60_000,   // loin dans le futur : pas de rafraîchissement ici
    };
    const connexion = new Connexion(j, {
      origineWs: 'ws://test',
      WebSocketImpl: FauxWebSocket as any,
      intervalFn: intervalFn as any,
      stockage: faux(null),   // non sollicité ici (jetons loin de l expiration) mais requis
    });

    await connexion.connecter();
    await connexion.connecter();
    await connexion.connecter();

    expect(intervalFn).toHaveBeenCalledTimes(1);
  });
});

/** Un faux websocket qui GARDE ce qu'on lui envoie et expose son `onmessage`, pour piloter
 *  le protocole HA depuis le test. Le `FauxWebSocket` déjà présent plus haut suffit au test
 *  de silence (il ne regarde que `intervalFn`) mais ne permet d'observer aucun envoi. */
class WsCapture {
  static derniere: WsCapture | undefined;
  onmessage: ((ev: any) => void) | null = null;
  onclose: (() => void) | null = null;
  envoyes: any[] = [];
  constructor(public url: string) { WsCapture.derniere = this; }
  send(brut: string) { this.envoyes.push(JSON.parse(brut)); }
  /** Rejoue un message venu de HA. */
  recevoir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

function connexionDeTest(deps: Record<string, unknown> = {}) {
  const jetons: any = {
    access_token: 'a', refresh_token: 'r', clientId: 'c',
    expires: Date.now() + 60 * 60_000,
  };
  return new Connexion(jetons, {
    origineWs: 'ws://test',
    WebSocketImpl: WsCapture as any,
    intervalFn: vi.fn() as any,
    stockage: faux(null),
    ...deps,
  } as any);
}

describe('Connexion — le code d un refus survit jusqu à l appelant', () => {
  it('rejette un RefusHA qui PORTE le code, pas seulement le message', async () => {
    // Décision 11 de la spec : `websocket.py` distingue quatre refus par leur CODE et ses
    // messages sont du français Python sans accents, destinés au journal HA. Si le client ne
    // garde que le message, les cinq dégradations deviennent indistinguables — et l'une
    // d'elles (`unknown_command`) est produite par HA en anglais, donc intraduisible ici.
    const cx = connexionDeTest();
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    const promesse = cx.envoyerCommande({ type: 'home_desk/ecran', nom: 'salon' });
    const envoye = ws.envoyes.find((m) => m.type === 'home_desk/ecran')!;
    ws.recevoir({
      id: envoye.id, type: 'result', success: false,
      error: { code: 'version_inconnue', message: 'la sous-entree ne porte aucune version' },
    });

    await expect(promesse).rejects.toBeInstanceOf(RefusHA);
    await promesse.catch((e: RefusHA) => {
      expect(e.code).toBe('version_inconnue');
      expect(e.message).toBe('la sous-entree ne porte aucune version');
    });
  });

  it('porte un code de repli plutôt que `undefined` quand HA n en donne aucun', async () => {
    const cx = connexionDeTest();
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });
    const promesse = cx.envoyerCommande({ type: 'peu/importe' });
    const envoye = ws.envoyes.find((m) => m.type === 'peu/importe')!;
    ws.recevoir({ id: envoye.id, type: 'result', success: false });
    await promesse.catch((e: RefusHA) => {
      expect(e.code).toBe('inconnu');
      expect(e.message).toBe('commande refusée');
    });
  });
});

describe('Connexion — prete() attend l authentification', () => {
  it('ne se résout PAS tant que auth_ok n est pas arrivé', async () => {
    // `connecter()` rend la main après avoir posé les gestionnaires, AVANT `auth_ok` : une
    // commande envoyée dans la foulée appellerait `ws.send()` sur une socket en CONNECTING.
    const cx = connexionDeTest();
    await cx.connecter();
    let resolue = false;
    void cx.prete().then(() => { resolue = true; });
    await Promise.resolve();
    expect(resolue).toBe(false);

    WsCapture.derniere!.recevoir({ type: 'auth_ok' });
    await cx.prete();
    expect(resolue).toBe(true);
  });
});

describe('Connexion — abonnement à un événement quelconque', () => {
  it('souscrit le type demandé et route sa charge utile', async () => {
    // Décision 2 de la spec : « un événement de bus déclenche le re-rendu à chaud ». Avant
    // ce correctif, `subscribe_events` ne portait que `state_changed` EN DUR et le
    // répartiteur n'examinait un `event` que s'il portait `data.new_state` : un
    // `home_desk_config_changed` tombait dans le vide SANS ERREUR.
    const cx = connexionDeTest();
    const vus: unknown[] = [];
    cx.surEvenement('home_desk_config_changed', (d) => vus.push(d));
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    const souscriptions = ws.envoyes.filter((m) => m.type === 'subscribe_events');
    expect(souscriptions.map((m) => m.event_type).sort())
      .toEqual(['home_desk_config_changed', 'state_changed']);

    ws.recevoir({
      type: 'event',
      event: { event_type: 'home_desk_config_changed', data: { nom: 'cuisine' } },
    });
    expect(vus).toEqual([{ nom: 'cuisine' }]);
  });

  it('ne livre à un abonné QUE son type d événement — décor à deux types', async () => {
    // Leçon 3 : un décor à un seul sujet rend le test aveugle. Avec un seul type abonné, une
    // implémentation qui livrerait TOUT à TOUS passerait.
    const cx = connexionDeTest();
    const config: unknown[] = [];
    const autre: unknown[] = [];
    cx.surEvenement('home_desk_config_changed', (d) => config.push(d));
    cx.surEvenement('call_service', (d) => autre.push(d));
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    ws.recevoir({ type: 'event', event: { event_type: 'call_service', data: { x: 1 } } });
    expect(config).toEqual([]);
    expect(autre).toEqual([{ x: 1 }]);
  });

  it('laisse INTACT le chemin state_changed, qui ne passe pas par surEvenement', async () => {
    // Contre-épreuve : les 1049 tests existants reposent sur `surChangement`. Un abonnement
    // générique qui détournerait `state_changed` les casserait tous d'un coup.
    const cx = connexionDeTest();
    const etats: unknown[] = [];
    cx.surChangement((e) => etats.push(e));
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });
    ws.recevoir({
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: { new_state: { entity_id: 'light.x', state: 'on', attributes: { a: 1 } } },
      },
    });
    expect(etats).toEqual([{ entity_id: 'light.x', state: 'on', attributes: { a: 1 } }]);
  });
});

describe('Connexion — une commande sans réponse ne pend pas pour toujours', () => {
  it('rejette passé le délai, plutôt que de figer l écran d attente', async () => {
    // Si HA accepte la commande puis redémarre, la réponse n'arrive jamais. Sans délai, la
    // promesse reste en suspens POUR TOUJOURS et l'écran d'attente « franc » de la
    // décision 10 devient un écran d'attente PERMANENT — la panne muette que ce projet
    // s'interdit.
    let rappel: (() => void) | undefined;
    const minuteurFn = vi.fn((fn: () => void) => { rappel = fn; return 1 as any; });
    const cx = connexionDeTest({ minuteurFn });
    await cx.connecter();
    WsCapture.derniere!.recevoir({ type: 'auth_ok' });

    const promesse = cx.envoyerCommande({ type: 'home_desk/ecran', nom: 'salon' });
    expect(minuteurFn).toHaveBeenCalledTimes(1);
    rappel!();

    await expect(promesse).rejects.toBeInstanceOf(RefusHA);
    await promesse.catch((e: RefusHA) => expect(e.code).toBe('delai_depasse'));
  });

  it('n arme aucun rejet tardif quand la réponse arrive à temps', async () => {
    let rappel: (() => void) | undefined;
    const minuteurFn = vi.fn((fn: () => void) => { rappel = fn; return 1 as any; });
    const cx = connexionDeTest({ minuteurFn });
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    const promesse = cx.envoyerCommande({ type: 'home_desk/ecran', nom: 'salon' });
    const envoye = ws.envoyes.find((m) => m.type === 'home_desk/ecran')!;
    ws.recevoir({ id: envoye.id, type: 'result', success: true, result: { nom: 'salon' } });
    await expect(promesse).resolves.toEqual({ nom: 'salon' });

    // Le minuteur finit par sonner : il ne doit RIEN faire (la promesse est déjà réglée, et
    // un second règlement serait silencieusement ignoré par le moteur de promesses — donc
    // invisible). On vérifie qu'il ne lève pas et que rien ne change.
    expect(() => rappel!()).not.toThrow();
    await expect(promesse).resolves.toEqual({ nom: 'salon' });
  });

  it('honore un délai explicite : minuteurFn le reçoit, et le message rendu porte SA durée', async () => {
    // Deux choses non gardées jusqu'ici : que `delaiMs` est bien le délai TRANSMIS à
    // `minuteurFn` (et non le défaut de 15 s ignoré en silence), et que le message français
    // rendu à l'appelant porte la PHRASE ENTIÈRE avec la bonne durée — épingler seulement
    // `e.code` laissait le texte libre de dire n'importe quoi (une durée fausse, de l'anglais,
    // une phrase vide). 3000 ms → « 3 s » : franc, et différent du défaut (15 s), pour qu'un
    // `Math.round` cassé ou un `delaiMs` ignoré rendent un texte visiblement faux.
    let rappel: (() => void) | undefined;
    const minuteurFn = vi.fn((fn: () => void, _delaiMs?: number) => { rappel = fn; return 1 as any; });
    const cx = connexionDeTest({ minuteurFn });
    await cx.connecter();
    WsCapture.derniere!.recevoir({ type: 'auth_ok' });

    const promesse = cx.envoyerCommande({ type: 'home_desk/ecran', nom: 'salon' }, 3000);
    expect(minuteurFn.mock.calls[0][1]).toBe(3000);
    rappel!();

    await promesse.catch((e: RefusHA) => {
      expect(e.message).toBe("Home Assistant n'a pas répondu en 3 s");
    });
  });
});

describe('Connexion.connecter est idempotente', () => {
  it('n ouvre PAS un second websocket quand la socket est déjà ouverte', async () => {
    // La coquille connecte, puis le corps rappelle `connecter()` sur la MÊME instance. Sans
    // cette garde, la seconde ouverture remplacerait `this.ws`, l'ancienne socket déclencherait
    // son `onclose`, et la boucle de reconnexion partirait sans raison.
    let ouvertures = 0;
    class Ws {
      readyState = 1;   // OPEN
      onmessage: ((ev: any) => void) | null = null;
      onclose: (() => void) | null = null;
      send() {}
      constructor(public url: string) { ouvertures++; }
    }
    const cx = new Connexion(
      { access_token: 'a', refresh_token: 'r', clientId: 'c', expires: Date.now() + 3_600_000 } as any,
      { origineWs: 'ws://test', WebSocketImpl: Ws as any, intervalFn: vi.fn() as any,
        minuteurFn: vi.fn() as any, stockage: faux(null) } as any,
    );
    await cx.connecter();
    await cx.connecter();
    expect(ouvertures).toBe(1);
  });

  // Relecture finale : contre-épreuve de la garde ci-dessus. Sans ce test, une garde ÉLARGIE à
  // `if (this.ws) return;` (au lieu de vérifier `readyState === 1`) laissait le test précédent
  // vert, et n'était rattrapée que PAR ACCIDENT par un test d'un autre fichier
  // (`pannes.test.ts`). Cette moitié de la règle — une socket FERMÉE doit pouvoir rouvrir —
  // n'était épinglée nulle part à côté de l'autre moitié.
  it('rouvre un nouveau websocket quand la socket est fermée (CLOSED)', async () => {
    let ouvertures = 0;
    class Ws {
      readyState = 3;   // CLOSED
      onmessage: ((ev: any) => void) | null = null;
      onclose: (() => void) | null = null;
      send() {}
      constructor(public url: string) { ouvertures++; }
    }
    const cx = new Connexion(
      { access_token: 'a', refresh_token: 'r', clientId: 'c', expires: Date.now() + 3_600_000 } as any,
      { origineWs: 'ws://test', WebSocketImpl: Ws as any, intervalFn: vi.fn() as any,
        minuteurFn: vi.fn() as any, stockage: faux(null) } as any,
    );
    await cx.connecter();
    await cx.connecter();
    expect(ouvertures).toBe(2);
  });
});

describe('Connexion — un abonné aux états posé APRÈS la connexion', () => {
  // Défaut trouvé en production le 2026-09-14, étape 5 de la mise en production du plan 3c :
  // la cuisine repointée sur `?ecran=Cuisine` rendait sa structure mais AUCUNE entité ne
  // résolvait — météo absente, tuiles sans `absenceNommee` filtrées, tuiles qui en portent une
  // inertes, thème sombre en plein jour (`sun.sun` jamais résolu).
  //
  // La cause est un ORDRE, et il est propre à `demarrer()` : cette porte connecte pour résoudre
  // la configuration, PUIS monte le corps, qui s'abonne alors par `surChangement`. Or `auth_ok`
  // envoie `get_states` immédiatement, et `emettre()` le distribue à `rappelsEtat` — vide à cet
  // instant. L'instantané se perd sans une erreur. Le second `connecter()` du corps retourne sur
  // la garde d'idempotence (`readyState === 1`) : aucun `get_states` n'est redemandé, et il ne
  // reste que les `state_changed` — donc les seules entités qui CHANGENT après coup.
  //
  // `demarrerAvecEcran()` (branche `data-piece`) n'a jamais eu le défaut : elle s'abonne avant
  // de connecter. C'est pourquoi le même bundle rendait juste par une porte et faux par l'autre,
  // et pourquoi 1 148 tests verts n'ont rien vu — ils montent tous par la porte qui marche.
  // `surEvenement`, dans cette même classe, traite DÉJÀ le cas de l'abonnement tardif
  // (`if (this.ws) this.souscrire(type)`) ; `surChangement` était le frère resté sans filet.
  it('reçoit quand même l état courant, au lieu de rater l instantané initial', async () => {
    const cx = connexionDeTest();
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    // L'instantané initial part ICI, et personne n'est encore abonné : il tombe dans le vide.
    const premier = ws.envoyes.find((m) => m.type === 'get_states');
    expect(premier).toBeDefined();
    ws.recevoir({
      type: 'result', id: premier.id, success: true,
      result: [{ entity_id: 'light.hotte', state: 'off', attributes: {} }],
    });

    // C'est l'ordre exact de `demarrer()` : connecter, résoudre l'écran, PUIS monter le corps.
    const vus: string[] = [];
    cx.surChangement((e) => vus.push(e.entity_id));

    const demandes = ws.envoyes.filter((m) => m.type === 'get_states');
    expect(demandes).toHaveLength(2);

    ws.recevoir({
      type: 'result', id: demandes[1].id, success: true,
      result: [{ entity_id: 'light.hotte', state: 'off', attributes: {} }],
    });
    expect(vus).toEqual(['light.hotte']);
  });

  it('ne redemande RIEN quand l abonné est posé AVANT la connexion', async () => {
    // Contre-épreuve : la branche `data-piece` s'abonne avant de connecter, et les 1 148 tests
    // existants montent par là. Un rattrapage qui partirait aussi dans ce cas doublerait
    // l'instantané initial sur le chemin normal — un aller-retour payé pour rien sur une Fire 7.
    const cx = connexionDeTest();
    cx.surChangement(() => {});
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    expect(ws.envoyes.filter((m) => m.type === 'get_states')).toHaveLength(1);
  });
});
