/** The three data sources a wall screen reads OUTSIDE the pushed entity states: the tasks of the
 *  room's `todo.*` lists, the weather forecasts and the calendars. None of them is pushed by
 *  `subscribe_events`, so each is loaded on demand and cached in the `ScreenState`. All three NEVER
 *  throw: an unavailable piece of data makes its block disappear, never the whole screen (rule 4 of
 *  the brief).
 *
 *  All three go through the websocket, never REST. The REST calls used to authenticate with the
 *  access token read from storage, which only `Connexion.connecter()` ever refreshed — that is,
 *  only when a socket is (re)opened. A tablet keeps one socket open for days and the token expires
 *  30 minutes after it is issued, so every forecast and calendar request past that half hour was
 *  refused. The socket is authenticated once, at `auth_ok`, and stays so for as long as it is open:
 *  a service call with `return_response` over it (Home Assistant websocket API, "Call an action":
 *  the result then carries `response`) needs no token at all. */
import { estCeJour, type Evenement } from '../agenda';
import { CALENDRIERS } from './constants';
import type { ConnexionLike } from './types';
import type { ScreenState } from './state';

/** The weather entity whose daily forecast feeds the header badge. */
const METEO = 'weather.maison';

/** Task 18: reloads the active tasks of every `todo.*` list of the room. Never throws
 *  (`Promise.allSettled`, not a mere `try/catch` around a sequential loop): a single unavailable
 *  list (websocket not open yet, command refused) must neither block nor make the others stale —
 *  each keeps its last known cache if its own request fails. Called at start-up (cache ready
 *  before the first press) and on every entry into the tasks view (freshness), never continuously
 *  in the background — see the reservation in the task 18 report. */
export async function chargerTaches(s: ScreenState): Promise<void> {
  const results = await Promise.allSettled(s.roomLists.map((e) => s.cx.listerTaches(e)));
  results.forEach((r, i) => { if (r.status === 'fulfilled') s.taches[s.roomLists[i]] = r.value; });
  s.dessiner();
}

/** Calls an entity service that returns data and gives back THAT entity's part of the response.
 *  Rejects when Home Assistant refuses the call, does not answer in time or the socket is closed
 *  (`Connexion.envoyerCommande`), and when the response carries nothing for the entity. */
async function serviceResponse(
  cx: ConnexionLike, domain: string, service: string, entityId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await cx.envoyerCommande({
    type: 'call_service', domain, service, service_data: data,
    target: { entity_id: entityId }, return_response: true,
  }) as { response?: Record<string, unknown> } | null | undefined;
  const part = result?.response?.[entityId];
  if (!part || typeof part !== 'object') throw new Error(`${domain}.${service}: no response for ${entityId}`);
  return part as Record<string, unknown>;
}

/** Never throws: an unavailable weather (socket closed, `weather.maison` not configured) must not
 *  break the screen — its blocks simply disappear (rule 4 of the brief). On failure the previous
 *  forecast is DROPPED, not kept: the badge would otherwise keep presenting the forecast of the
 *  last successful load as current, for as long as the failure lasts. Called at start-up and every
 *  15 minutes by `d.intervalFn`. */
export async function chargerMeteo(s: ScreenState): Promise<void> {
  try {
    const part = await serviceResponse(s.cx, 'weather', 'get_forecasts', METEO, { type: 'daily' });
    // Task 12 review, STILL TRUE: nothing guarantees that the integration returns the current day
    // first (Open-Meteo may drop it late in the day). The whole window is passed on as is; it is
    // `agenda.ts` (`prochainChangement`, `pastilleBandeau`) that finds today and tomorrow by their
    // DATE, never by their position in the array.
    s.jours = Array.isArray(part.forecast) ? part.forecast : [];
  } catch (err) {
    s.jours = [];
    console.warn('weather forecast unavailable', err instanceof Error ? err.message : err);
  }
  s.dessiner();
}

type RawCalendarEvent = { summary?: unknown; start?: unknown };

/** Never throws, same discipline as `chargerMeteo`. The four calendars are queried in parallel and
 *  their results merged. A calendar whose request fails keeps its LAST KNOWN events
 *  (`evenementsParCalendrier`) instead of contributing none: an appointment carries its own time,
 *  so yesterday's answer stays true where it says something, whereas an empty list would claim
 *  "no appointment" — indistinguishable on the wall from a free day.
 *
 *  The queried window spans 24 h, whereas `pastilleBandeau` trusts its caller to hand it only
 *  TODAY's birthday: a birthday of tomorrow, returned by the same request, would be shown as
 *  "Today" — and so would any all-day event of tomorrow. It is therefore discarded HERE, at the source — on every load, cached events included,
 *  since the day may have changed since they were fetched. */
export async function chargerAgenda(s: ScreenState): Promise<void> {
  // `d.maintenant()` and not `new Date()`, like everywhere else in `boot/`: a single, injectable
  // clock, otherwise the requested window and the filter of the day may diverge.
  const maintenant = s.d.maintenant();
  const fin = new Date(maintenant.getTime() + 24 * 3_600_000);
  const reponses = await Promise.allSettled(CALENDRIERS.map(async (entite) => {
    const part = await serviceResponse(s.cx, 'calendar', 'get_events', entite, {
      start_date_time: maintenant.toISOString(), end_date_time: fin.toISOString(),
    });
    if (!Array.isArray(part.events)) throw new Error(`calendar.get_events: no events for ${entite}`);
    return (part.events as RawCalendarEvent[]).map((e): Evenement => {
      const debut = String(e.start ?? '');
      return {
        resume: String(e.summary ?? ''),
        debut,
        estAnniversaire: entite === 'calendar.anniversaires',
        // Home Assistant serialises an all-day start as a bare ISO date (`date.isoformat()`) and a
        // timed one as a date-time, which always carries the `T` separator.
        journeeEntiere: debut !== '' && !debut.includes('T'),
      };
    });
  }));
  reponses.forEach((r, i) => {
    if (r.status === 'fulfilled') s.evenementsParCalendrier[CALENDRIERS[i]] = r.value;
    else console.warn('calendar unavailable', CALENDRIERS[i], r.reason instanceof Error ? r.reason.message : r.reason);
  });
  s.evenements = CALENDRIERS
    .flatMap((entite) => s.evenementsParCalendrier[entite] ?? [])
    .filter((e) => e.resume !== '' && e.debut !== '')
    // A birthday or any other all-day event is a DAY: only today's belongs on the wall.
    .filter((e) => !(e.estAnniversaire || e.journeeEntiere) || estCeJour(e.debut, maintenant));
  s.dessiner();
}
