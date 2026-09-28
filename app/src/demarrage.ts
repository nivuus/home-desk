/** Orchestration of a wall screen's start-up: reads the session, opens the HA connection, draws
 *  the screen, and catches *every* failure so as never to leave `#app` empty (correction round
 *  1 — a blank wall, without a message, helps nobody). Isolated from `index.ts` to be testable
 *  without depending on a real WebSocket: see `ConnexionLike` and `DependancesDemarrage`.
 *
 *  Split on 2026-09-28 along its seams; this module keeps the two entry points and the retry
 *  loops, the rest lives in `boot/`:
 *   - `boot/types.ts` — the connection contract and the injectable dependencies;
 *   - `boot/state.ts` — the state of one mounted screen, shared by every module below;
 *   - `boot/wiring.ts` — the one-time wiring (subscriptions, gestures, listeners), with
 *     `boot/controls.ts` (timer, car and recipe actions) and `boot/test-hooks.ts` (`?essai=1`);
 *   - `boot/loaders.ts` — tasks, weather and calendar loading;
 *   - `boot/recipe.ts` — the recipe in progress;
 *   - `boot/timers.ts` — the local tickers and the night wake;
 *   - `boot/draw.ts` — `dessiner()`, with `boot/frame.ts`, `boot/subviews.ts` and `boot/home.ts`;
 *   - `boot/constants.ts` — cadences, delays and the monotonic clock. */
import { render } from 'lit';
import { Connexion, lireJetons, delaiReconnexion, type Jetons } from './connexion';
import { intervalFnParDefaut, minuteurFnParDefaut } from './minuteurs';
import type { Ecran } from './ecran';
import { resoudreAgencement } from './agencement';
import {
  sessionAbsente, startupError, ecranEnAttente, choisirEcran, ecranDeLaPanne,
} from './rendu/repli';
import { armerRechargement } from './rechargement';
import { roomTodoLists } from './cochage';
import { chargerEcran as chargerEcranHA, listerEcrans as listerEcransHA } from './configuration';
import { niveauDemande, type Niveau } from './mouvement';
// The next two lines carry an English-check exception: the engine factory is named by `mouvement/moteur.ts`, a
// 611-line file from main that this branch does not touch (renaming it would pull that file over
// the size limit into the diff).
import { creerMoteur } from './mouvement/moteur';   // policy: allow-fr — see above
import type { DependancesDemarrage } from './boot/types';
import { ScreenState } from './boot/state';
import { wireScreen } from './boot/wiring';
import { chargerTaches, chargerMeteo, chargerAgenda } from './boot/loaders';
import { enterPantry } from './boot/pantry';
import { dessiner } from './boot/draw';
import { SEUIL_MUET_MS } from './boot/constants';

export type { ConnexionLike, DependancesDemarrage } from './boot/types';

/** Starts the screen of the given room in `racine`. Never throws: the promise covers everything
 *  `tenter()` does, including its initialisation (`createConnection`, `surChangement`, `surMaj`) —
 *  correction round 3, where those three lines had escaped the `try/catch`. A connection failure
 *  displays `startupError()` then schedules an attempt again with the same exponential backoff
 *  as the websocket reconnection (`delaiReconnexion`, 1 s → 30 s capped). At run time, a revoked
 *  token (definitive, a session will have to be reopened) cannot be told from a network cut
 *  (temporary, resolves itself): retrying indefinitely covers both without human intervention on
 *  a wall screen, and the displayed message stays true in both cases ("if it persists, log in
 *  again"). The attempt counter is reset to zero as soon as an attempt succeeds, so that a later
 *  cut starts again from a short delay.
 *
 *  This function receives an ALREADY RESOLVED screen. It is `startScreen()`, below, that obtains
 *  it — from Home Assistant in normal use, from the `ECRANS` literal on the transition path (see
 *  `index.ts`). Separating the two keeps this body indifferent to where its configuration comes
 *  from, and that is what allowed introducing it without touching the screen body. */
export async function startWithScreen(
  racine: HTMLElement, piece: Ecran, deps: Partial<DependancesDemarrage> = {},
): Promise<void> {
  // Task 20: the colour tokens (`--md-*`, `jetons.css`) and the day/night mode (class `.sombre`)
  // are scoped to `.m3`, set statically on `racine` (`#app`) by the HTML of each tablet.
  // `html`/`body`, ANCESTORS of `racine`, therefore never get them through CSS inheritance — a
  // custom property only inherits towards descendants, never towards an ancestor — which left the
  // fallback background of `base.css` (`html, body`) stuck on its fixed fallback, visible below
  // `#app` on the band the panel would let show under the height of the frame (`height: 100%`
  // since task 18, see `base.css`).
  // Setting `.m3` here too, NEVER by removing it from `racine` (purely additive, hence without
  // risk for any selector already targeting it on `racine`), makes the same tokens visible from
  // the root of the document; `.sombre` is mirrored here at the same time as on `racine`, by the
  // palette switch of `dessiner()`, on every redraw. Set before any early return (no session,
  // connection error): those fallback screens also benefit from the right background, not only
  // the normal screen.
  document.documentElement.classList.add('m3');

  const d: DependancesDemarrage = {
    stockage: deps.stockage ?? localStorage,
    createConnection: deps.createConnection ?? ((jetons) => new Connexion(jetons)),
    // Single source of this `.bind(globalThis)`: `./minuteurs.ts` (correction round 2, see its
    // docstring). Same trap as `connexion.ts` — `d.intervalFn`/`d.minuteurFn` are always called
    // through property access (`d.intervalFn(...)`), never bare.
    intervalFn: deps.intervalFn ?? intervalFnParDefaut,
    minuteurFn: deps.minuteurFn ?? minuteurFnParDefaut,
    maintenant: deps.maintenant ?? (() => new Date()),
    // `startWithScreen` never calls them (it receives an already resolved screen): these two
    // fields only exist here so that `d` satisfies `DependancesDemarrage` in full, the same bag of
    // dependencies that `startScreen()` below passes on to it as is.
    chargerEcran: deps.chargerEcran ?? chargerEcranHA,
    listerEcrans: deps.listerEcrans ?? listerEcransHA,
  };

  const jetonsLus = lireJetons(d.stockage);
  if (!jetonsLus) {
    render(sessionAbsente(), racine);
    return;
  }
  // TypeScript does not propagate the type narrowing of the guard above into the `tenter()`
  // closure defined below (a known limitation of flow analysis across function boundaries):
  // `jetons` captures the value already guaranteed non-null in a separate constant, so that
  // `tenter()` does not need a `!` assertion.
  const jetons: Jetons = jetonsLus;

  // Correction round 2: a single instance of `Connexion` (and of `Etat`) for the whole lifetime
  // of the page — not one per attempt. `connecter()` arms a silence-watch `setInterval`
  // (`armerSurveillanceSilence()`) *before* the line that can throw (`rafraichir()`); the
  // `silenceArme` guard set at task 3 does prevent a double arming on the same instance, but
  // protects nothing against fresh instances. Recreating `cx` on every failure (revoked token,
  // persistent Wi-Fi cut — the HA server is also the access point of the house) therefore left
  // behind each attempt a permanent timer, closed over an abandoned instance never collected.
  // Reusing the same instance makes the guard work as intended: a single timer, whatever the
  // number of failures. Same reasoning for `surChangement`/`surMaj`: registered once only, not on
  // every attempt, so as not to make the internal callback arrays of `Connexion` and `Etat` grow
  // indefinitely.
  //
  // Correction round 3: `createConnection`/`surChangement`/`surMaj` ran outside any
  // `try/catch` — if they throw (they should not with the default factory, which only touches
  // globals always present in a browser, but nothing forbids it to an injected
  // `createConnection`), `startScreen()` rejects without any `render()` happening: the blank wall
  // of round 1, back three lines higher. `initialise` moves this initialisation *into*
  // `tenter()`, under a guard so that it only runs once even in case of a late success after
  // several failures — otherwise `cx` would be recreated on every attempt and the leak of round 2
  // reintroduced. If it is the initialisation itself that fails, it is retried at the next
  // attempt (it could not set `initialise` to `true`); since `connecter()` is never reached in
  // that case, no timer is armed, hence no leak in that branch either.
  let initialise = false;
  let attempt = 0;

  // Motion (task 10, then task 1 of the grammar project): level requested at start-up —
  // `prefers-reduced-motion` or `?mouvement=` in the URL, FIXED for the whole lifetime of the page
  // (the cadence regulator that degraded it along the way has been removed, see
  // `src/mouvement.ts`). `niveauInitial` is computed once only, here, never recomputed, because
  // ONE thing outside the engine — `tictacProgression` — still needs it too, as an emergency
  // fallback without a redeployment (Fully Kiosk, task 9); passed AS IS to
  // the engine (`niveauInitial`, option of the engine factory) so that both computations share
  // the same reading of `location.href`/`matchMedia`, never two separate calls.
  const niveauInitial: Niveau = niveauDemande(
    location.href,
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const s = new ScreenState(
    racine, piece, d, resoudreAgencement(piece), roomTodoLists(piece), niveauInitial,
    creerMoteur(racine, { niveauInitial }), dessiner,   // policy: allow-fr — see the import
  );

  async function tenter(): Promise<void> {
    try {
      if (!initialise) {
        wireScreen(s, jetons);
        initialise = true;
      }
      await s.cx.connecter();
      attempt = 0;
      d.intervalFn(s.dessiner, 20_000);   // the clock moves on even without an entity change
      void chargerMeteo(s);
      d.intervalFn(() => chargerMeteo(s), 15 * 60_000);
      // Task 12: the same cadence as the weather. A quarter of an hour is enough for a badge that
      // announces an appointment up to three hours ahead (`FENETRE_MS`, `agenda.ts`), and that is
      // as many requests fewer on a tablet with 130 MB free.
      void chargerAgenda(s);
      d.intervalFn(() => chargerAgenda(s), 15 * 60_000);
      // Batch 6: NO MORE interval for the meal. It comes from an entity attribute, so it arrives
      // through `subscribe_events` — already subscribed, already coalesced (`Etat.notifier`), and
      // up to date to the second rather than to the quarter of an hour. The 15-minute callback
      // that lived here cost 3.8 MB of HTTP traffic per day on a Fire 7 with 130 MB free; it no
      // longer costs anything because it no longer exists. It is the main gain of that batch,
      // and it can be measured.
      // Task 18: a single load at start-up (cache ready before the first press on the summary
      // line), no periodic refresh — the view already reloads on every entry (see the
      // `hashchange` listener, `boot/wiring.ts`), enough for a view one never leaves open for
      // more than 45 s anyway (automatic return); see the reservation in the report.
      void chargerTaches(s);
      // Page reloaded while the pantry was open (Fully killed, tablet rebooted): no `hashchange`
      // happens, so the view is entered here, once connected.
      if (location.hash === '#garde-manger') enterPantry(s);
      // Task 17: that reasoning no longer holds for the two rooms whose central block may display
      // those same tasks PERMANENTLY (`replEntretien`, `boot/home.ts`) — with nothing to refresh
      // the cache, the home view would indefinitely show the list of the start-up instant, and a
      // wall tablet stays on for weeks.
      //
      // Task 17 bis (review, defect D1): THE MAIN FRESHNESS PATH IS NO LONGER THIS ONE, it is the
      // reload triggered by the pushed state of `todo.maintenance` (`cx.surChangement`,
      // `boot/wiring.ts`). The previous version of this comment claimed that a task checked off
      // elsewhere "arrives through NO pushed path": that was FALSE. `todo/item/list` indeed has no
      // counterpart in `subscribe_events`, and the pushed state only carries a counter, never the
      // labels — but that counter is indeed pushed (it is consumed by the summary line, `{etat}`,
      // see `ecran.ts`), and it is enough as a SIGNAL to go and fetch the labels again.
      //
      // This 15-minute callback REMAINS, as a safety net, for the only case the signal does not
      // cover: Home Assistant emits no `state_changed` when the state and the attributes are
      // identical — a synchronisation that closes one task and opens another in the same pass
      // leaves the counter unchanged and pushes nothing, whereas the labels have changed. The same
      // cadence as the weather/calendar/meal and `chargerTaches` as is, never a second loader
      // dedicated to `todo.maintenance`: that would be a second read path for the same data, and
      // the tasks view benefits along the way. The living room, whose central block is the car in
      // all circumstances, has nothing to gain from it: one more websocket command every 15 min on
      // a Fire 7 with 130 MB free, for a result it never renders.
      if (s.agencement.blocDefaut === 'repas' || s.agencement.blocDefaut === 'agenda') {
        d.intervalFn(() => chargerTaches(s), 15 * 60_000);
      }
      s.dessiner();
    } catch {
      render(startupError(), racine);
      // M7 (final review) — THIS `render()` BYPASSES THE ENGINE: it replaces the whole content of
      // `racine` without `peindre()` knowing anything about it. The remembered snapshot then
      // points at DETACHED nodes, and on reconnection the next painting would compare that dead
      // snapshot with a fresh one — ghost exits on content already replaced. `oublier()` makes the
      // next painting start again like a first one: it remembers and stays silent.
      //
      // THE OTHER DIRECT `render()` OF THIS FUNCTION (`sessionAbsente`) DOES NOT NEED IT, and that
      // can be checked: it runs BEFORE the engine is built (the `lireJetons` guard leaves
      // `startWithScreen()` through a `return` well above the line that builds the engine) — so
      // there is no snapshot to throw away, nor even an engine to call `oublier` on.
      s.moteur.oublier();
      // No `void` here: the callback returns the promise of `tenter()` (allowed, a function that
      // returns `Promise<void>` is assignable to `() => void`). In production, `setTimeout`
      // ignores it anyway; in the tests, `minuteurFn` is a double that captures the callback —
      // being able to await it makes it possible to check that a successful attempt does erase
      // the error screen, without depending on a real delay.
      d.minuteurFn(() => tenter(), delaiReconnexion(attempt++));
    }
  }

  await tenter();
}

/** Starts the NAMED screen in `racine`: waiting → loading → rendering.
 *
 *  It is the entry point of the application since the configuration lives in Home Assistant
 *  (spec of 2026-09-12). It resolves the screen, then delegates to `startWithScreen`, which did
 *  not change by one line — it is this separation that allowed introducing the transport without
 *  touching the body of the screen, nor the 292 references to `ECRANS` in the twelve test files
 *  that mount it.
 *
 *  Never throws. The five failures fall into three families, and the handling DIFFERS:
 *   - `reseau`: we retry, with exponential backoff, indefinitely. It is the only one time
 *     repairs, and it is what the text of `startupError()` promises — "a new attempt will take
 *     place automatically".
 *   - `introuvable`: we offer the list. Retrying would change nothing; the requested screen does
 *     not exist, and the choice is immediately useful.
 *   - `version`, `corrompu`, `integrationAbsente`: we display, and we stop. Those three wait for a
 *     HUMAN gesture, which the screen names. A retry loop has never repaired an unreadable
 *     configuration; it would only consume the network of a tablet with 130 MB free while hiding
 *     the real message behind a flicker. */
export async function startScreen(
  racine: HTMLElement, nomEcran: string, deps: Partial<DependancesDemarrage> = {},
): Promise<void> {
  // Same reason as at the start of `startWithScreen`: the colour tokens are scoped to `.m3`, and
  // the fallback screens also benefit from the right background.
  document.documentElement.classList.add('m3');

  const stockage = deps.stockage ?? localStorage;
  const minuteurFn = deps.minuteurFn ?? minuteurFnParDefaut;
  const chargerEcranFn = deps.chargerEcran ?? chargerEcranHA;
  const listerEcransFn = deps.listerEcrans ?? listerEcransHA;

  const jetons = lireJetons(stockage);
  if (!jetons) {
    // Before any network round trip: without a session, no command would leave anyway.
    render(sessionAbsente(), racine);
    return;
  }

  render(ecranEnAttente(nomEcran), racine);

  // A SINGLE instance for the resolution AND for the body: a second one would set a second
  // silence-watch timer, closed over an abandoned instance — the leak correction round 2 closed.
  // `connecter()` has been idempotent since that task, so the body can call it again without
  // opening a second websocket.
  const cx = (deps.createConnection ?? ((j: Jetons) => new Connexion(j)))(jetons);
  const depsDuCorps: Partial<DependancesDemarrage> = { ...deps, createConnection: () => cx };

  // Armed BEFORE `connecter()`: `abonner` remembers the subscription and the subscribe
  // request leaves at the first `auth_ok`, then is REPLAYED on every reconnection (see
  // `connexion.ts`). Armed once only for the lifetime of the page, never on every attempt — same
  // invariant as `surChangement`/`surSilence`, and same reason: the callback arrays of
  // `Connexion` would grow indefinitely.
  //
  // The reload goes through `location.reload()` rather than an internal redraw: the configuration
  // touches EVERYTHING (layout, modes, budget, timers, sources), and replaying a complete start-up
  // in an already mounted page would require cleanly undoing timers, subscriptions and an
  // animation engine — a lot of new code, for a page that reloads in less than a second on a
  // Fire 7 and whose local state nobody looks at.
  //
  // Found in the final branch review, deliberately NOT fixed: when `?ecran=` is absent,
  // `nomEcran` is `''` HERE (before the `offerScreenList` branch a little below), and it is
  // therefore with this EMPTY name that `armerRechargement` is armed. No payload of
  // `home_desk/abonner` event will ever carry `nom: ''` (see `rechargement.ts`, filter by name):
  // the hot reload therefore stays INERT on the "choose a screen" page. Creating the first screen
  // from Home Assistant while this selector is displayed on the tablet therefore does not refresh
  // it on its own. Defensible — the user's next gesture in front of this selector is a press to
  // choose a screen, which reloads anyway — and not fixed here: a debt that is written in no
  // versioned file does not exist.
  armerRechargement(cx, nomEcran, deps.recharger ?? (() => location.reload()));

  // Home Assistant unreachable at cold start (production gate of 2026-09-28, defect B). `prete()`
  // only settles at the first `auth_ok` and never rejects, because `Connexion` reconnects on its
  // own: awaiting it alone left the tablet on the waiting screen forever, and the `catch` below
  // was unreachable for that failure. Making `prete()` reject would not help: the next attempt
  // would call `connecter()` while the internal reconnection is already opening a socket — a
  // second websocket. So the start-up path OBSERVES the connection instead of racing it: the
  // silence watch is the signal `Connexion` already gives for "the house does not answer", and
  // `SEUIL_MUET_MS` is the threshold the mounted body uses for the same verdict (grey screen plus
  // offline banner) — one definition of "unreachable", not a second, arbitrary timeout. Past it,
  // the waiting screen gives way to `startupError()`, whose promise ("a new attempt will take
  // place automatically") is kept by that same internal reconnection: at the first `auth_ok`,
  // `prete()` resolves and `tenterChargement()` carries on by itself, on the same socket, with
  // no reload. Once authenticated, this callback falls silent for good: a later outage belongs
  // to the body, which must never be replaced by a start-up message.
  let authenticated = false;
  let unreachableShown = false;
  cx.surSilence((ms) => {
    if (authenticated || unreachableShown || ms <= SEUIL_MUET_MS) return;
    unreachableShown = true;
    render(startupError(), racine);
  });

  const offerScreenList = async (): Promise<void> => {
    const list = await listerEcransFn(cx);
    render(
      list.ok ? choisirEcran(list.value) : ecranDeLaPanne(list.panne, nomEcran),
      racine,
    );
  };

  let attempt = 0;
  const tenterChargement = async (): Promise<void> => {
    try {
      await cx.connecter();
      await cx.prete();
      authenticated = true;

      // `?ecran=` absent: we already know the answer, no point asking for a screen named "".
      if (nomEcran === '') { await offerScreenList(); return; }

      const result = await chargerEcranFn(cx, nomEcran);
      if (result.ok) {
        await startWithScreen(racine, result.value, depsDuCorps);
        return;
      }
      if (result.panne === 'introuvable') { await offerScreenList(); return; }
      if (result.panne === 'reseau') throw new Error('reseau');
      render(ecranDeLaPanne(result.panne, nomEcran), racine);
    } catch {
      render(startupError(), racine);
      // Without `void`: the same convention as `d.minuteurFn(() => tenter(), ...)` in
      // `startWithScreen` — the promise is returned, not swallowed, so that a test that captures
      // this callback can await it to the end (`await rappels[0]!()`).
      minuteurFn(() => tenterChargement(), delaiReconnexion(attempt++));
    }
  };

  await tenterChargement();
}
