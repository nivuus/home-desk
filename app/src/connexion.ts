/** Accès à Home Assistant. La page est servie par HA sur la même origine, donc elle partage
 *  le localStorage du frontend : aucun jeton n'est écrit dans un fichier ni dans une URL —
 *  /local/ est servi SANS authentification. */
import { intervalFnParDefaut } from './minuteurs';

export type Jetons = {
  access_token: string; refresh_token: string; expires: number; clientId: string;
};

export type EvenementEtat = {
  entity_id: string; state: string; attributes: Record<string, unknown>;
};

const MARGE_MS = 5 * 60_000;

export function lireJetons(stockage: Storage): Jetons | null {
  try {
    const brut = stockage.getItem('hassTokens');
    if (!brut) return null;
    const j = JSON.parse(brut);
    return j && j.access_token ? j : null;
  } catch {
    return null;   // stockage vidé ou corrompu : on redemandera une session
  }
}

/** Le jeton d'accès expire en 30 minutes. Sans rafraîchissement, un écran mural meurt
 *  silencieusement au bout d'une demi-heure. */
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

export function delaiReconnexion(essai: number): number {
  return Math.min(1000 * 2 ** essai, 30000);
}

/** Dépendances injectables de `Connexion`, pour pouvoir tester `connecter()` sans navigateur
 *  ni websocket réel. Toutes ont une valeur par défaut prise dans les globales du navigateur,
 *  résolue paresseusement (via `??`) : en usage réel (page servie par HA), rien ne change. */
export type DependancesConnexion = {
  fetchFn: typeof fetch;
  intervalFn: typeof setInterval;
  stockage: Storage;
  origineWs: string;
  WebSocketImpl: new (url: string) => WebSocket;
};

export class Connexion {
  private ws: WebSocket | null = null;
  private id = 1;
  private essai = 0;
  private jetons: Jetons;
  private rappelsEtat: ((e: EvenementEtat) => void)[] = [];
  private rappelsSilence: ((ms: number) => void)[] = [];
  private dernierMessage = 0;
  /** Tâche 14 : requêtes websocket EN ATTENTE de leur réponse, appariées par `id` — nécessaire
   *  pour `todo/item/list` (vue « Tâches »), qui n'a pas d'équivalent `call_service` et dont la
   *  réponse ne doit jamais être confondue avec celle de `get_states` (traitée plus bas de façon
   *  générique par `type === 'result' && Array.isArray(m.result)`, jamais appariée à un `id`
   *  précis jusqu'ici — un seul type de requête « sans réponse suivie » suffisait avant cette
   *  tâche). Vérifiée EN PREMIER dans `onmessage` : comme aucun `id` de `get_states`/
   *  `subscribe_events` n'est jamais enregistré ici, les deux mécanismes restent mutuellement
   *  exclusifs sans rien se voler. */
  private enAttenteCommandes = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  /** Garde-fou anti-fuite : la surveillance du silence ne doit être armée qu'une seule fois
   *  pour la durée de vie de l'objet. `connecter()` est rappelé à chaque coupure websocket
   *  (`ws.onclose`) ; sans cette garde, chaque reconnexion empilait un `setInterval`
   *  supplémentaire — fatal sur une tablette à 130 Mo de libre qui décroche régulièrement du
   *  Wi-Fi. */
  private silenceArme = false;
  private readonly deps: DependancesConnexion;

  constructor(jetons: Jetons, deps: Partial<DependancesConnexion> = {}) {
    this.jetons = jetons;
    this.deps = {
      fetchFn: deps.fetchFn ?? fetch,
      // Source unique de ce `.bind(globalThis)` : `./minuteurs.ts` (ronde de correction 2, voir
      // son docstring — trois recopies indépendantes de ce bind, une par site d'usage, laissaient
      // une régression casser silencieusement un site sur trois selon le cas).
      intervalFn: deps.intervalFn ?? intervalFnParDefaut,
      stockage: deps.stockage ?? localStorage,
      origineWs: deps.origineWs ?? location.origin.replace(/^http/, 'ws'),
      WebSocketImpl: deps.WebSocketImpl ?? WebSocket,
    };
  }

  surChangement(cb: (e: EvenementEtat) => void) { this.rappelsEtat.push(cb); }
  surSilence(cb: (ms: number) => void) { this.rappelsSilence.push(cb); }

  /** Arme la surveillance du silence une seule fois (cf. `silenceArme`). Appelée en tête de
   *  `connecter()` pour être posée avant tout risque d'échec de connexion, sans jamais être
   *  reposée sur reconnexion. */
  private armerSurveillanceSilence() {
    if (this.silenceArme) return;
    this.silenceArme = true;
    this.deps.intervalFn(() => {
      const ms = Date.now() - this.dernierMessage;
      for (const cb of this.rappelsSilence) cb(ms);
    }, 5000);
  }

  async connecter(): Promise<void> {
    this.armerSurveillanceSilence();

    if (doitRafraichir(this.jetons, Date.now())) {
      this.jetons = await rafraichir(this.jetons, this.deps.fetchFn, Date.now());
      this.deps.stockage.setItem('hassTokens', JSON.stringify(this.jetons));
    }
    const url = this.deps.origineWs + '/api/websocket';
    const ws = new this.deps.WebSocketImpl(url);
    this.ws = ws;

    ws.onmessage = (ev) => {
      this.dernierMessage = Date.now();
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: this.jetons.access_token }));
      } else if (m.type === 'auth_ok') {
        this.essai = 0;
        ws.send(JSON.stringify({ id: this.id++, type: 'subscribe_events',
                                 event_type: 'state_changed' }));
        ws.send(JSON.stringify({ id: this.id++, type: 'get_states' }));
      } else if (m.type === 'event' && m.event?.data?.new_state) {
        const n = m.event.data.new_state;
        this.emettre({ entity_id: n.entity_id, state: n.state, attributes: n.attributes });
      } else if (m.type === 'result' && this.enAttenteCommandes.has(m.id)) {
        const p = this.enAttenteCommandes.get(m.id)!;
        this.enAttenteCommandes.delete(m.id);
        if (m.success) p.resolve(m.result);
        else p.reject(new Error(m.error?.message ?? 'commande refusée'));
      } else if (m.type === 'result' && Array.isArray(m.result)) {
        for (const n of m.result)
          this.emettre({ entity_id: n.entity_id, state: n.state, attributes: n.attributes });
      }
    };
    ws.onclose = () => this.reconnecter();
  }

  /** Tâche 9 : point d'entrée unique de la reconnexion interne, rappelé à la fois par
   *  `ws.onclose` (coupure du websocket) et par le `.catch` ci-dessous en cas d'échec de la
   *  tentative elle-même. Avant ce correctif, seul `ws.onclose` reprogrammait quoi que ce soit :
   *  `setTimeout(() => void this.connecter(), d)` ne rattrapait rien, donc si `connecter()`
   *  levait — `rafraichir()` refuse le jeton de rafraîchissement (révoqué), ou réseau coupé au
   *  mauvais moment — le rejet devenait non observé (silencieux en production) ET la chaîne de
   *  reconnexion s'arrêtait pour de bon : `connecter()` ayant levé avant de créer un nouveau
   *  websocket, aucun `ws.onclose` n'était reposé pour retenter plus tard. Sur une coupure Wi-Fi
   *  qui dure le temps qu'un jeton d'accès expire (30 min, le serveur HA est aussi le point
   *  d'accès de la maison), l'écran restait alors figé sur des données périmées, en silence,
   *  sans plus jamais retenter — le chemin de panne visé par cette tâche.
   *
   *  Cette reconnexion interne contourne volontairement l'orchestration de `demarrage.ts`
   *  (`tenter()`, qui ne surveille que la toute première connexion `await cx.connecter()`) :
   *  elle n'affichera donc jamais `erreurDemarrage()`, quel que soit le nombre d'échecs. Ce
   *  n'est pas elle qui rend une panne durable visible — c'est `surSilence`, câblé par
   *  `demarrage.ts` sur le minuteur armé une seule fois en tête de `connecter()`
   *  (`armerSurveillanceSilence`), qui continue de tourner sans interruption quoi qu'il arrive
   *  ici, tant que l'objet `Connexion` existe. */
  private reconnecter() {
    const d = delaiReconnexion(this.essai++);
    setTimeout(() => { void this.connecter().catch(() => this.reconnecter()); }, d);
  }

  private emettre(e: EvenementEtat) { for (const cb of this.rappelsEtat) cb(e); }

  appelerService(domaine: string, service: string, donnees: Record<string, unknown>) {
    this.ws?.send(JSON.stringify({
      id: this.id++, type: 'call_service', domain: domaine, service, service_data: donnees,
    }));
  }

  /** Tâche 14 : envoie une commande websocket arbitraire et attend sa réponse appariée par `id`
   *  (cf. `enAttenteCommandes`). Rejette immédiatement si le websocket n'est pas ouvert — jamais
   *  une promesse qui reste en suspens pour toujours sur une connexion morte (l'appelant,
   *  `listerTaches` ci-dessous, n'est de toute façon invoqué que sous la même garde `estHorsLigne`
   *  que le reste des commandes, cf. `demarrage.ts`, mais cette réponse explicite couvre aussi un
   *  appel direct hors de ce garde-fou). */
  envoyerCommande(payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws) { reject(new Error('websocket indisponible')); return; }
      const id = this.id++;
      this.enAttenteCommandes.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  /** Liste les tâches ACTIVES (`status !== 'completed'`) d'une liste `todo.*` — habillage de
   *  `envoyerCommande` pour la commande websocket `todo/item/list` (vue « Tâches », tâche 14).
   *  Une réponse malformée (pas de tableau `items`) rend une liste vide plutôt que de lever :
   *  l'appelant (`demarrage.ts`, `chargerTaches`) avale de toute façon toute erreur, mais autant
   *  ne jamais produire une valeur qui ferait planter un `.map` en aval. */
  async listerTaches(entite: string): Promise<{ uid: string; texte: string }[]> {
    const resultat = await this.envoyerCommande({ type: 'todo/item/list', entity_id: entite }) as
      { items?: { uid: string; summary: string; status: string }[] } | undefined;
    const items = Array.isArray(resultat?.items) ? resultat.items : [];
    return items.filter((it) => it.status !== 'completed').map((it) => ({ uid: it.uid, texte: it.summary }));
  }
}
