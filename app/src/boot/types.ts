/** The two contracts a wall screen is started with: the connection it talks through, and the
 *  bag of injectable dependencies. Both exist so that the tests can start a real screen without a
 *  real WebSocket, a real clock or a real page reload. */
import type { Jetons, EvenementEtat } from '../connexion';
import type { ConnexionAppelable } from '../interaction';
import type { Ecran } from '../ecran';
import type { ListEntry, Result, TransportConfig } from '../configuration';

/** What `startWithScreen` expects from a connection: just enough not to depend on the concrete
 *  `Connexion` class, so that it can be replaced by a double in the tests (revoked refresh token,
 *  network cut...) without building a real WebSocket.
 *  `ConnexionAppelable` (hence `appelerService`) has been required since task 7: it is through this
 *  interface, not through the concrete `Connexion` class, that `createPress` (`interaction.ts`)
 *  receives what it needs to call a service — its private fields would forbid any test double. */
export type ConnexionLike = {
  connecter(): Promise<void>;
  /** Resolved once websocket authentication has succeeded. Required by `startScreen()`: before
   *  this task, `connecter()` returned BEFORE `auth_ok`, so the very first websocket command of
   *  the application called `ws.send()` on a socket still in CONNECTING. */
  prete(): Promise<void>;
  surChangement(cb: (e: EvenementEtat) => void): void;
  // Task 9: `surSilence` has existed on `Connexion` since task 3 (armed once only by
  // `connecter()`) but was consumed nowhere — the timer ran in a vacuum. It is the only signal
  // that keeps working even when the internal reconnection of `Connexion` is broken for good
  // (refresh token revoked after a connection was already established: its retry loop bypasses
  // `tenter()` and therefore never shows `startupError()`, see the comment of
  // `Connexion.reconnecter` in `connexion.ts`): it is what guarantees that a lasting outage
  // always ends up being visible.
  surSilence(cb: (ms: number) => void): void;
  // Task 18: required by `chargerTaches` (`boot/loaders.ts`, the tasks view), which lists the
  // content of every `todo.*` of the room through `Connexion.listerTaches` (`connexion.ts`) — same
  // reason as `surSilence` at task 9: one more member on this narrow interface, never the concrete
  // `Connexion` class (whose private fields would forbid any light test double).
  listerTaches(entite: string): Promise<{ uid: string; texte: string }[]>;
  /** Batch 6: the three `home_stock/*` commands of the recipe view (`recipe/get`,
   *  `meal/preview`, `meal/validate`). `Connexion.envoyerCommande` already accepts any websocket
   *  `type` and matches the answer by `id` — the channel did not need to change, only this narrow
   *  interface had to declare it. It returns a PROMISE, so a refusal from the server
   *  (`InsufficientStock`, already translated into French by the component) is DISPLAYABLE —
   *  which an `appelerService`, a fire-and-forget send, does not allow. */
  envoyerCommande(payload: Record<string, unknown>): Promise<unknown>;
  /** The hot reload subscribes through here, with the integration's own command (see
   *  `Connexion.abonner`). */
  abonner(commande: Record<string, unknown>, cb: (evenement: Record<string, unknown>) => void): void;
} & ConnexionAppelable;

export type DependancesDemarrage = {
  stockage: Storage;
  createConnection: (jetons: Jetons) => ConnexionLike;
  intervalFn: typeof setInterval;
  minuteurFn: typeof setTimeout;
  maintenant: () => Date;
  /** Injectable so that the tests mount a screen without a transport — and so that the transition
   *  path (`index.ts`, `data-piece`) serves the literal through the same door. */
  chargerEcran: (cx: TransportConfig, nom: string) => Promise<Result<Ecran>>;
  listerEcrans: (cx: TransportConfig) => Promise<Result<ListEntry[]>>;
  /** Task 5 of plan 3b: replaces `location.reload()` in the tests, so that they do not have to
   *  reload a real page. */
  recharger?: () => void;
};
