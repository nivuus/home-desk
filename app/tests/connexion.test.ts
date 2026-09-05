import { describe, it, expect, vi } from 'vitest';
import { lireJetons, doitRafraichir, rafraichir, delaiReconnexion, Connexion } from '../src/connexion';

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
