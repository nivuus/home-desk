/** The fixed cadences and delays of a wall screen's lifetime, plus the monotonic clock the local
 *  tickers read. Shared by every module of `boot/`: each number is written in one place only. */

/** Task 9: beyond this silence (no websocket message, `Connexion.lastMessageAt` frozen), the
 *  screen is considered stale. The old Lovelace setup went blank after an HA restart, leaving a
 *  screen full of holes while the entities stayed silent for about a minute; 30 s keeps a margin
 *  below that typical delay while avoiding greying out on a mere network round trip (the silence
 *  between two normal `state_changed` events is well below that). */
export const SEUIL_MUET_MS = 30_000;

/** Task 12: the four personal calendars of the installation (taken from
 *  `ha_sync/entities/calendar.json`). `calendar.radarr*`, the inventory calendars,
 *  `calendar.workday_sensor_calendrier` and public holidays are deliberately absent: they are
 *  not appointments, and a wall has nothing to say about a Blu-ray release.
 *  `calendar.anniversaires` is flagged separately — it has its own priority in `pastilleBandeau`. */
export const CALENDRIERS = ['calendar.anniversaires', 'calendar.famille',
                            'calendar.personnel', 'calendar.professionnel'];

/** Task 15 review (I1): rate of the media progress rail. One second — the smallest granularity the
 *  eye can tell apart on a 279 px rail for a 4-minute track (one pixel every ~0.9 s), and 20 times
 *  less work than `dessiner()` would do by redrawing. This tick writes ONLY a CSS custom property
 *  on an already-rendered element (`--progression`, which drives a `background-image`): no `lit`
 *  render, no layout recomputation. Same mechanism as the optimistic feedback of `--niveau` on
 *  `.media-rail` (`rendu/media.ts`). */
export const PAS_PROGRESSION_MS = 1_000;

/** Automatic return to the home view after touch inactivity — 45 s, the same constant for the
 *  three sub-views (the whole house `#maison`, the tasks `#taches`, and since task 10 bis the timer setting
 *  `#minuteur`, see `armerRetour`): a single number to change if the rule ever evolves. */
export const RETOUR_MS = 45_000;

/** `#recette` is the ONLY sub-view exempt from `RETOUR_MS`: a recipe is read there while cooking,
 *  and 45 s of touch inactivity is the norm in front of a saucepan. Its 30-minute fallback does
 *  NOT close the recipe, it COLLAPSES it (hash reset to empty, `recetteUid` intact): the wall
 *  screen goes back home without losing the step. It is the 4-hour expiry of
 *  `src/recette-en-cours.ts` that eventually forgets, never this fallback. */
export const RETOUR_RECETTE_MS = 30 * 60_000;

/** The MONOTONIC clock of the rail. `performance.now` and not `Date.now`: the rail must survive a
 *  clock jump (and stay measurable by `outils/verifier-rendu.mjs`, which freezes `Date`).
 *  Falls back on `Date.now` in an environment without `performance` — never an error. */
export const horlogeMonotone = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
