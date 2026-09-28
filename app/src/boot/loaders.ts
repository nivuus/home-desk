/** The three data sources a wall screen reads OUTSIDE the pushed entity states: the tasks of the
 *  room's `todo.*` lists (a websocket request), the weather forecasts and the calendars (REST).
 *  None of them is pushed by `subscribe_events`, so each is loaded on demand and cached in the
 *  `ScreenState`. All three NEVER throw: an unavailable piece of data makes its block disappear,
 *  never the whole screen (rule 4 of the brief). */
import { lireJetons } from '../connexion';
import { estCeJour } from '../agenda';
import { CALENDRIERS } from './constants';
import type { ScreenState } from './state';

/** Task 18: reloads the active tasks of every `todo.*` list of the room. Never throws
 *  (`Promise.allSettled`, not a mere `try/catch` around a sequential loop): a single unavailable
 *  list (websocket not open yet, command refused) must neither block nor make the others stale —
 *  each keeps its last known cache if its own request fails, same discipline as `chargerMeteo`
 *  ("an unavailable piece of data makes its block disappear, never the whole screen"). Called at
 *  start-up (cache ready before the first press) and on every entry into the tasks view
 *  (freshness), never continuously in the background — see the reservation in the task 18
 *  report. */
export async function chargerTaches(s: ScreenState): Promise<void> {
  const results = await Promise.allSettled(s.roomLists.map((e) => s.cx.listerTaches(e)));
  results.forEach((r, i) => { if (r.status === 'fulfilled') s.taches[s.roomLists[i]] = r.value; });
  s.dessiner();
}

/** Never throws: an unavailable weather (network, `weather.maison` not configured, token not
 *  refreshed yet) must not break the screen — its blocks simply disappear (rule 4 of the brief).
 *  The token is re-read from `d.stockage` on every call rather than captured once:
 *  `Connexion.connecter()` may have refreshed it and written it back to storage in the meantime,
 *  and this function is also called back every 15 minutes by `d.intervalFn`. */
export async function chargerMeteo(s: ScreenState): Promise<void> {
  try {
    const j = lireJetons(s.d.stockage);
    if (j) {
      const entete = { 'Authorization': `Bearer ${j.access_token}`, 'Content-Type': 'application/json' };
      // Task 14: a single forecast type since `hourly` (the `previsions` block, only reader of
      // `horaire`) disappeared — `daily` remains necessary, it is the PERMANENT fallback of the
      // header badge (`pastilleBandeau`, `agenda.ts`), see `jours` in `boot/state.ts`.
      const r = await fetch('/api/services/weather/get_forecasts?return_response=true', {
        method: 'POST', headers: entete,
        body: JSON.stringify({ entity_id: 'weather.maison', type: 'daily' }),
      });
      if (r.ok) {
        const data = await r.json();
        // Task 12 review, STILL TRUE AT TASK 13: nothing guarantees that the integration returns
        // the current day first (Open-Meteo may drop it late in the day) — but it is no longer
        // this file that must beware of it. The whole window is passed on as is; it is
        // `agenda.ts` (`prochainChangement`, `pastilleBandeau`) that finds today and tomorrow by
        // their DATE, never by their position in the array — an array that would not start with
        // today therefore no longer invents a lie there.
        s.jours = data.service_response?.['weather.maison']?.forecast ?? [];
      }   // otherwise: weather unavailable, the fallback disappears, the screen lives (rule 4)
    }
  } catch {
    // fetch unavailable/rejected (network, test environment without network...): same hidden
    // blocks, never a broken screen — see the comment above.
  }
  s.dessiner();
}

/** Never throws, same discipline as `chargerMeteo`: an unavailable calendar makes the personal
 *  badge disappear (weather fallback — task 13, no longer always "Tomorrow"), never the screen.
 *  The four calendars are queried in parallel and their results merged.
 *
 *  The queried window spans 24 h, whereas `pastilleBandeau` trusts its caller to hand it only
 *  TODAY's birthday: a birthday of tomorrow, returned by the same request, would be shown as
 *  "Today". It is therefore discarded HERE, at the source — a birthday has no time, only a date,
 *  and nothing downstream could catch it. */
export async function chargerAgenda(s: ScreenState): Promise<void> {
  try {
    const j = lireJetons(s.d.stockage);
    if (j) {
      // `d.maintenant()` and not `new Date()`, like everywhere else in `boot/`: a single,
      // injectable clock, otherwise the requested window and the filter of the day may diverge.
      const maintenant = s.d.maintenant();
      const fin = new Date(maintenant.getTime() + 24 * 3_600_000);
      const entete = { 'Authorization': `Bearer ${j.access_token}`, 'Content-Type': 'application/json' };
      const reponses = await Promise.allSettled(CALENDRIERS.map(async (entite) => {
        const url = `/api/calendars/${entite}`
          + `?start=${maintenant.toISOString()}&end=${fin.toISOString()}`;
        const r = await fetch(url, { headers: entete });
        if (!r.ok) return [];
        const brut = await r.json();
        return (brut as { summary?: string; start?: { dateTime?: string; date?: string } }[]).map((e) => ({
          resume: String(e.summary ?? ''),
          debut: String(e.start?.dateTime ?? e.start?.date ?? ''),
          estAnniversaire: entite === 'calendar.anniversaires',
        }));
      }));
      s.evenements = reponses
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((e) => e.resume !== '' && e.debut !== '')
        .filter((e) => !e.estAnniversaire || estCeJour(e.debut, maintenant));
    }
  } catch {
    // same rule as chargerMeteo: the badge falls back on its weather fallback, the screen lives
  }
  s.dessiner();
}
