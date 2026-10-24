/** Access to Home Assistant. The page is served by HA on the same origin, so it shares the
 *  frontend's localStorage: no token is ever written to a file or into a URL — /local/ is served
 *  WITHOUT authentication. */
import { intervalFnParDefaut, minuteurFnParDefaut } from './minuteurs';

export type Jetons = {
  access_token: string; refresh_token: string; expires: number; clientId: string;
};

export type EvenementEtat = {
  entity_id: string; state: string; attributes: Record<string, unknown>;
};

/** A refusal from Home Assistant, with ITS CODE.
 *
 *  Decision 11 of the spec: `websocket.py` distinguishes four refusals by a code (`not_found`,
 *  `version_inconnue`, `ecran_corrompu`, plus `unknown_command` returned by HA's core when the
 *  command is not registered at all). Their `message`s, for their part, are Python French
 *  WITHOUT accents: developer diagnostics meant for the HA log, never user sentences. Throwing
 *  the code away to keep only the message — what `envoyerCommande` did before this task — made
 *  the five degradations indistinguishable, and pushed towards showing the user a sentence this
 *  repository does not write for them.
 *
 *  `message` remains accessible, and a caller CAN display it out of laziness. It is
 *  `configuration.ts` that translates a code into an accented French sentence, and the test that
 *  pins THE RENDERED SENTENCE is what guards this boundary. */
export class RefusHA extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RefusHA';
  }
}

/** Beyond this delay, a websocket command without an answer is abandoned. Fifteen seconds: well
 *  above any real latency on the house network (the HA server is also the access point), well
 *  below the patience of whoever walks past a wall screen. */
const DELAI_COMMANDE_MS = 15_000;

const MARGE_MS = 5 * 60_000;

export function lireJetons(stockage: Storage): Jetons | null {
  try {
    const brut = stockage.getItem('hassTokens');
    if (!brut) return null;
    const j = JSON.parse(brut);
    return j && j.access_token ? j : null;
  } catch {
    return null;   // storage emptied or corrupt: a session will be asked for again
  }
}

/** The access token expires in 30 minutes. Without a refresh, a wall screen dies silently after
 *  half an hour. */
export function doitRafraichir(j: Jetons, maintenant: number): boolean {
  return maintenant >= j.expires - MARGE_MS;
}

export async function rafraichir(
  j: Jetons, fetchFn: typeof fetch, maintenant: number,
): Promise<Jetons> {
  const corps = new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: j.refresh_token, client_id: j.clientId,
  });
  const rep = await fetchFn('/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps,
  });
  if (!rep.ok) throw new Error(`Rafraîchissement refusé : ${rep.status}`);
  const d = await rep.json();
  return {
    ...j,
    access_token: d.access_token,
    expires: maintenant + d.expires_in * 1000,
  };
}

export function delaiReconnexion(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30000);
}

/** Injectable dependencies of `Connexion`, so that `connecter()` can be tested without a browser
 *  or a real websocket. All of them have a default value taken from the browser globals,
 *  resolved lazily (via `??`): in real use (page served by HA), nothing changes. */
/** What a subscription delivers: the `event` field of each message Home Assistant tags with the
 *  subscription's `id`. */
export type RappelAbonnement = (evenement: Record<string, unknown>) => void;

export type DependancesConnexion = {
  fetchFn: typeof fetch;
  intervalFn: typeof setInterval;
  /** Needed for the maximum delay of `envoyerCommande`. Same single source of
   *  `.bind(globalThis)` as `intervalFn`: `./minuteurs.ts`. */
  minuteurFn: typeof setTimeout;
  stockage: Storage;
  origineWs: string;
  WebSocketImpl: new (url: string) => WebSocket;
};

export class Connexion {
  private ws: WebSocket | null = null;
  private id = 1;
  private attempt = 0;
  private jetons: Jetons;
  private rappelsEtat: ((e: EvenementEtat) => void)[] = [];
  private rappelsSilence: ((ms: number) => void)[] = [];
  /** Subscription COMMANDS (`abonner`), kept for the lifetime of the page and replayed on
   *  every `auth_ok`, like `state_changed`. */
  private abonnements: { commande: Record<string, unknown>; cb: RappelAbonnement }[] = [];
  /** The callback of each subscription sent on the CURRENT socket, by the `id` of its request:
   *  Home Assistant tags every `event` of a subscription with that `id`. Cleared on each
   *  `auth_ok`, since the ids of a closed socket mean nothing on the next one. */
  private abonnementsParId = new Map<number, RappelAbonnement>();
  /** Has the current socket received `auth_ok`? Home Assistant closes a socket that sends
   *  anything but `auth` before that, so a subscription registered in the meantime waits for
   *  `auth_ok`, which sends it. */
  private authentifiee = false;
  /** Has the initial snapshot (`get_states`) already been requested on the current socket?
   *
   *  Used by `surChangement`: a subscriber registered AFTER `auth_ok` missed that snapshot, which
   *  was distributed to an empty callback list and lost without any error. Reset to `false` on
   *  every socket opening, so that a reconnection starts again from the right state. */
  private etatsDemandes = false;
  /** Resolved on the first `auth_ok`, NEVER put back to pending on reconnection.
   *
   *  `prete()` answers "can a command be sent?" for the FIRST command, the startup one — the only
   *  moment when the question arose, since all the rest of the code only calls `envoyerCommande`
   *  well afterwards, under the `estHorsLigne` guard of `demarrage.ts`. Putting it back to
   *  pending on every drop would make a caller that has nothing left to learn wait forever; a
   *  LASTING failure is still reported by `surSilence`, which is the mechanism meant for that and
   *  which keeps running whatever happens here. */
  private resoudrePrete: (() => void) | null = null;
  private readonly pretePromesse: Promise<void> =
    new Promise((r) => { this.resoudrePrete = r; });
  private lastMessageAt = 0;
  /** Task 14: websocket requests WAITING for their answer, matched by `id` — needed for
   *  `todo/item/list` ("Tâches" view), which has no `call_service` equivalent and whose answer
   *  must never be confused with the one of `get_states` (handled further down generically by
   *  `type === 'result' && Array.isArray(m.result)`, never matched to a specific `id` until now —
   *  a single kind of "untracked answer" request was enough before this task). Checked FIRST in
   *  `onmessage`: since no `id` of `get_states`/`subscribe_events` is ever registered here, the
   *  two mechanisms remain mutually exclusive without stealing from each other. */
  private enAttenteCommandes = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  /** Anti-leak safeguard: the silence watch must be armed only once for the lifetime of the
   *  object. `connecter()` is called again on every websocket drop (`ws.onclose`); without this
   *  guard, each reconnection stacked one more `setInterval` — fatal on a tablet with 130 MB
   *  free that regularly drops off the Wi-Fi. */
  private silenceArme = false;
  private readonly deps: DependancesConnexion;

  constructor(jetons: Jetons, deps: Partial<DependancesConnexion> = {}) {
    this.jetons = jetons;
    this.deps = {
      fetchFn: deps.fetchFn ?? fetch,
      // Single source of this `.bind(globalThis)`: `./minuteurs.ts` (correction round 2, see
      // its docstring — three independent copies of this bind, one per usage site, let a
      // regression silently break one site out of three depending on the case).
      intervalFn: deps.intervalFn ?? intervalFnParDefaut,
      minuteurFn: deps.minuteurFn ?? minuteurFnParDefaut,
      stockage: deps.stockage ?? localStorage,
      origineWs: deps.origineWs ?? location.origin.replace(/^http/, 'ws'),
      WebSocketImpl: deps.WebSocketImpl ?? WebSocket,
    };
  }

  /** Subscribes a callback to state changes.
   *
   *  Callable BEFORE `connecter()` (the case of `startWithScreen`, which subscribes then
   *  connects) as well as AFTER (the case of `startScreen`, which connects first to resolve the
   *  configuration, and only mounts the body afterwards) — same contract as `abonner` just
   *  below.
   *
   *  The catch-up is not a convenience: without it, a subscriber registered after `auth_ok` only
   *  receives the `state_changed` events, hence only the entities that CHANGE. All the others —
   *  a hood that is off, a still curtain, the weather, `sun.sun` — NEVER resolve. That is the
   *  defect that made step 5 of the 2026-09-14 production rollout fail: the tablet rendered its
   *  structure and not a single state. */
  surChangement(cb: (e: EvenementEtat) => void) {
    this.rappelsEtat.push(cb);
    if (this.etatsDemandes) this.demanderEtats();
  }
  surSilence(cb: (ms: number) => void) { this.rappelsSilence.push(cb); }

  prete(): Promise<void> { return this.pretePromesse; }

  /** Subscribes a callback to a subscription COMMAND: `commande` is sent as is (an `id` is
   *  added), and every `event` Home Assistant tags with that `id` goes to `cb`.
   *
   *  Not `subscribe_events`: Home Assistant only lets a NON-ADMIN user subscribe to a fixed
   *  allowlist of bus events, and the tablets log in as such a user. Measured on 2026-09-28,
   *  "Refusing to allow Tablet to subscribe to event home_desk_config_changed" at every start:
   *  the generic bus subscription this method replaced never reached the wall. An integration
   *  exposes its own subscription command instead (`home_desk/abonner`), open to any
   *  authenticated user.
   *
   *  Callable BEFORE `connecter()` (the normal case: `demarrage.ts` subscribes then connects) as
   *  well as after. Subscriptions are REPLAYED on every `auth_ok`, so a reconnection loses no
   *  subscriber. */
  abonner(commande: Record<string, unknown>, cb: RappelAbonnement) {
    const abonnement = { commande, cb };
    this.abonnements.push(abonnement);
    if (this.authentifiee) this.envoyerAbonnement(abonnement);
  }

  /** The snapshot request, in the singular: `auth_ok` sends it for the new socket, and
   *  `surChangement` sends it again for a subscriber that arrived too late. Two wordings of the
   *  same send would end up diverging. */
  private demanderEtats() {
    this.ws?.send(JSON.stringify({ id: this.id++, type: 'get_states' }));
  }

  private souscrire(type: string) {
    this.ws?.send(JSON.stringify({ id: this.id++, type: 'subscribe_events', event_type: type }));
  }

  private envoyerAbonnement(abonnement: { commande: Record<string, unknown>; cb: RappelAbonnement }) {
    const id = this.id++;
    this.abonnementsParId.set(id, abonnement.cb);
    this.ws?.send(JSON.stringify({ ...abonnement.commande, id }));
  }

  /** Arms the silence watch only once (see `silenceArme`). Called at the top of `connecter()` so
   *  that it is set before any risk of connection failure, without ever being set again on
   *  reconnection. */
  private armerSurveillanceSilence() {
    if (this.silenceArme) return;
    this.silenceArme = true;
    // The silence is counted from the moment we start listening. Left at 0, the first tick
    // reported the time since 1970, so a house that has not answered YET was declared silent 5 s
    // after boot instead of after `SEUIL_MUET_MS` — the cold-start verdict of `startScreen`
    // depends on that threshold meaning the same thing there as in the mounted body.
    this.lastMessageAt = Date.now();
    this.deps.intervalFn(() => {
      const ms = Date.now() - this.lastMessageAt;
      for (const cb of this.rappelsSilence) cb(ms);
    }, 5000);
  }

  async connecter(): Promise<void> {
    this.armerSurveillanceSilence();

    // Idempotent on purpose: `startScreen()` connects to resolve the configuration, then passes
    // THE SAME instance to the body, which calls `connecter()` again. Without this guard, the
    // second opening would replace `this.ws`; the old socket would fire its `onclose`, hence
    // `reconnecter()`, and the page would go into a reconnection loop without any drop having
    // happened.
    //
    // The guard does NOT hinder real reconnection: when `ws.onclose` calls `connecter()` again,
    // `readyState` is CLOSED (3), never OPEN. And a test double without `readyState`
    // (`undefined !== 1`) passes the guard as before.
    if (this.ws && this.ws.readyState === 1) return;

    if (doitRafraichir(this.jetons, Date.now())) {
      this.jetons = await rafraichir(this.jetons, this.deps.fetchFn, Date.now());
      this.deps.stockage.setItem('hassTokens', JSON.stringify(this.jetons));
    }
    const url = this.deps.origineWs + '/api/websocket';
    const ws = new this.deps.WebSocketImpl(url);
    this.ws = ws;
    // New socket: its snapshot has not gone out yet. Without this reset, a subscriber arriving
    // during a reconnection would believe it had missed it and would request a second one,
    // which `auth_ok` would send anyway.
    this.etatsDemandes = false;
    this.authentifiee = false;

    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: this.jetons.access_token }));
      } else if (m.type === 'auth_ok') {
        this.attempt = 0;
        this.authentifiee = true;
        this.souscrire('state_changed');
        this.abonnementsParId.clear();
        for (const abonnement of this.abonnements) this.envoyerAbonnement(abonnement);
        this.demanderEtats();
        this.etatsDemandes = true;
        this.resoudrePrete?.();
        this.resoudrePrete = null;
      } else if (m.type === 'event' && this.abonnementsParId.has(m.id)) {
        // Checked BEFORE the `new_state` branch: a subscription's `event` is recognised by its
        // `id`, whatever it carries.
        this.abonnementsParId.get(m.id)!(m.event ?? {});
      } else if (m.type === 'result' && this.abonnementsParId.has(m.id) && !m.success) {
        // A refused subscription is the silent failure this method exists to end: say it, with
        // Home Assistant's code (`unknown_command` = a component too old for this page).
        console.error('abonnement refusé', m.error?.code, m.error?.message);
      } else if (m.type === 'event' && m.event?.data?.new_state) {
        const n = m.event.data.new_state;
        this.emettre({ entity_id: n.entity_id, state: n.state, attributes: n.attributes });
      } else if (m.type === 'result' && this.enAttenteCommandes.has(m.id)) {
        const p = this.enAttenteCommandes.get(m.id)!;
        this.enAttenteCommandes.delete(m.id);
        if (m.success) p.resolve(m.result);
        else p.reject(new RefusHA(
          typeof m.error?.code === 'string' ? m.error.code : 'inconnu',
          m.error?.message ?? 'commande refusée',
        ));
      } else if (m.type === 'result' && Array.isArray(m.result)) {
        for (const n of m.result)
          this.emettre({ entity_id: n.entity_id, state: n.state, attributes: n.attributes });
      }
    };
    ws.onclose = () => this.reconnecter();
  }

  /** Task 9: single entry point of the internal reconnection, called both by `ws.onclose`
   *  (websocket drop) and by the `.catch` below when the attempt itself fails. Before this fix,
   *  only `ws.onclose` rescheduled anything: `setTimeout(() => void this.connecter(), d)` caught
   *  nothing, so if `connecter()` threw — `rafraichir()` refuses the refresh token (revoked), or
   *  the network drops at the wrong moment — the rejection became unobserved (silent in
   *  production) AND the reconnection chain stopped for good: since `connecter()` had thrown
   *  before creating a new websocket, no `ws.onclose` was set again to retry later. On a Wi-Fi
   *  drop lasting as long as it takes an access token to expire (30 min, the HA server is also
   *  the house's access point), the screen then stayed frozen on stale data, silently, without
   *  ever retrying again — the failure path this task targets.
   *
   *  This internal reconnection deliberately bypasses the orchestration of `demarrage.ts`
   *  (`tenter()`, which only watches the very first connection `await cx.connecter()`): it will
   *  therefore never display `startupError()`, whatever the number of failures. It is not what
   *  makes a lasting failure visible — that is `surSilence`, wired by `demarrage.ts` onto the
   *  timer armed only once at the top of `connecter()` (`armerSurveillanceSilence`), which keeps
   *  running without interruption whatever happens here, as long as the `Connexion` object
   *  exists. */
  private reconnecter() {
    const d = delaiReconnexion(this.attempt++);
    setTimeout(() => { void this.connecter().catch(() => this.reconnecter()); }, d);
  }

  private emettre(e: EvenementEtat) { for (const cb of this.rappelsEtat) cb(e); }

  appelerService(domaine: string, service: string, data: Record<string, unknown>) {
    this.ws?.send(JSON.stringify({
      id: this.id++, type: 'call_service', domain: domaine, service, service_data: data,
    }));
  }

  /** Sends an arbitrary websocket command and waits for its answer matched by `id` (see
   *  `enAttenteCommandes`). Three ways of ending, never any other:
   *   - HA answers `success` → the promise returns `result`;
   *   - HA refuses → `RefusHA`, with its code;
   *   - HA does not answer within `delaiMs` → `RefusHA('delai_depasse', …)`.
   *
   *  That third case is the one nobody saw: if HA accepts the command then restarts, the answer
   *  never arrives, and before this task the promise stayed pending FOREVER — the waiting screen
   *  of decision 10 became a permanent waiting screen.
   *
   *  The timer is not cancelled; it does not need to be. The first settlement — by HA's answer
   *  or by the timer, whichever arrives first — removes the entry from `enAttenteCommandes` via
   *  `finir`; if the timer fires afterwards, `enAttenteCommandes` no longer holds anything for
   *  that `id` and its callback has nobody left to settle twice. And if the timer did fire before
   *  HA's answer (the reverse order), settling an already settled promise is a no-op of the
   *  ECMAScript specification: an executor's `resolve`/`reject` do nothing after the first call,
   *  without throwing or producing an unobserved rejection. Cancelling the timer would require
   *  injecting a `clearTimeout` too in order to stay testable, to save one fifteen-second timer
   *  per command — a complication more expensive than what it avoids. */
  envoyerCommande(
    payload: Record<string, unknown>, delaiMs: number = DELAI_COMMANDE_MS,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws) { reject(new Error('websocket indisponible')); return; }
      const id = this.id++;
      const finir = <T>(suite: (v: T) => void) => (v: T) => {
        this.enAttenteCommandes.delete(id);
        suite(v);
      };
      this.enAttenteCommandes.set(id, {
        resolve: finir(resolve), reject: finir(reject),
      });
      this.deps.minuteurFn(
        finir(() => reject(new RefusHA(
          'delai_depasse',
          `Home Assistant n'a pas répondu en ${Math.round(delaiMs / 1000)} s`,
        ))),
        delaiMs,
      );
      this.ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  /** Lists the ACTIVE tasks (`status !== 'completed'`) of a `todo.*` list — a wrapper around
   *  `envoyerCommande` for the `todo/item/list` websocket command ("Tâches" view, task 14). A
   *  malformed answer (no `items` array) returns an empty list rather than throwing: the caller
   *  (`demarrage.ts`, `chargerTaches`) swallows any error anyway, but we might as well never
   *  produce a value that would crash a `.map` downstream. */
  async listerTaches(entite: string): Promise<{ uid: string; texte: string }[]> {
    const result = await this.envoyerCommande({ type: 'todo/item/list', entity_id: entite }) as
      { items?: { uid: string; summary: string; status: string }[] } | undefined;
    const items = Array.isArray(result?.items) ? result.items : [];
    return items.filter((it) => it.status !== 'completed').map((it) => ({ uid: it.uid, texte: it.summary }));
  }
}
