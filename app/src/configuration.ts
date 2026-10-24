/** The client of the websocket transport delivered by plan 3a (`custom_components/home_desk/
 *  websocket.py`). It requests a screen or the list of screens, and turns any refusal into a
 *  NAMED FAILURE. It renders nothing and does not touch the DOM: it is `rendu/repli.ts` that
 *  knows what to show for each failure, and `demarrage.ts` that wires the two. */
import type { Ecran } from './screen-types';
import type { DeclarationSource } from './media';
import { RefusHA } from './connexion';

/** The five ways loading a screen can fail. Five, not four: the original spec named only four
 *  and let "the integration is not installed" fall into the network failure message — which
 *  tells the operator to debug their Wi-Fi when HA answered instantly and correctly. */
export type Panne = 'introuvable' | 'version' | 'corrompu' | 'integrationAbsente' | 'reseau';

export type Result<T> = { ok: true; value: T } | { ok: false; panne: Panne };

/** The appliance types of the house (`contrat/maison.schema.json`, `$defs/appareil`). */
export type ApplianceType = 'imprimante' | 'aspirateur' | 'voiture' | 'animaux' | 'plantes' | 'tapis' | 'air' | 'alarme' | 'encre';

/** One appliance of the house, validated by the component: `piece` is a room name or `"maison"`
 *  (shown everywhere), `entites` maps each role to an entity id, or to a list of them for the
 *  list roles (`ams`, `sondes`, `zones`, `niveaux`). The roles each type requires live in the
 *  contract only. */
export type Appareil = { type: ApplianceType; piece: string; entites: Record<string, string | string[]>; seuil?: number };

/** What `home_desk/maison` serves: the media sources and the appliances shared by every tablet. */
export type House = { sources: DeclarationSource[]; appareils: Appareil[] };

/** A house with nothing declared. */
export const EMPTY_HOUSE: House = { sources: [], appareils: [] };

/** One row of `home_desk/ecrans`. `nom` is the transport's primary key (entered data);
 *  `titre` is `ConfigSubentry.title`, a generic Home Assistant property that the user can
 *  rename on their own. Two distinct fields, even though they are kept in sync by the identity
 *  form. */
export type ListEntry = { nom: string; titre: string };

/** What this module expects from a connection: just `envoyerCommande`. Neither the concrete
 *  `Connexion` class (its private fields would rule out a lightweight test double), nor
 *  `ConnexionLike` from `demarrage.ts` (which asks for five times more). */
export type TransportConfig = {
  envoyerCommande(payload: Record<string, unknown>): Promise<unknown>;
};

/** The codes as they travel ON THE WIRE, hardcoded.
 *
 *  `app/src/` is TypeScript and cannot import `const.py`: these four strings are hardcoded on
 *  both sides of the language boundary, and the test that pins them is the only safety net
 *  there is. Measured on 2026-09-13 on the installed component.
 *
 *  ⚠️ `not_found` and not `ecran_introuvable`: the component deliberately reuses Home
 *  Assistant's `websocket_api.const.ERR_NOT_FOUND`.
 *  `unknown_command` is NOT produced by this repository: it is HA's core that answers that when
 *  the command is not registered, that is, when the integration is not installed. */
const PANNE_PAR_CODE: Record<string, Panne> = {
  not_found: 'introuvable',
  version_inconnue: 'version',
  ecran_corrompu: 'corrompu',
  unknown_command: 'integrationAbsente',
};

/** Anything that is not a NAMED refusal from HA is a link problem: websocket closed, unreadable
 *  JSON, timeout (`delai_depasse`, set by `connexion.ts` when HA does not answer). "reseau" is
 *  therefore also the fallback, on purpose — an unknown code means the component evolved
 *  without this client, and the network screen is the only one that stays true. */
function panneDe(error: unknown): Panne {
  if (error instanceof RefusHA) return PANNE_PAR_CODE[error.code] ?? 'reseau';
  return 'reseau';
}

/** Asks Home Assistant for the named screen, RESOLVED AND VALIDATED by the component. */
export async function chargerEcran(cx: TransportConfig, nom: string): Promise<Result<Ecran>> {
  try {
    const brut = await cx.envoyerCommande({ type: 'home_desk/ecran', nom });
    return { ok: true, value: brut as Ecran };
  } catch (error) {
    return { ok: false, panne: panneDe(error) };
  }
}

/** Asks for the list of configured screens, for the first degradation.
 *
 *  The component does NOT revalidate each screen here, on purpose: one corrupt screen must not
 *  deprive the tablets of the choice of the others. An EMPTY list is therefore a SUCCESS — "HA
 *  reachable, no screen configured" is a degradation distinct from "HA unreachable", and mixing
 *  them up would replace right advice ("go create one") with wrong advice ("check the
 *  network"). */
export async function listerEcrans(cx: TransportConfig): Promise<Result<ListEntry[]>> {
  try {
    const brut = await cx.envoyerCommande({ type: 'home_desk/ecrans' });
    if (!Array.isArray(brut)) return { ok: false, panne: 'corrompu' };
    return { ok: true, value: brut as ListEntry[] };
  } catch (error) {
    return { ok: false, panne: panneDe(error) };
  }
}

/** Asks for the media sources and appliances shared by the whole house (`home_desk/maison`),
 *  validated by the component. Both lists empty when no house is configured — a success, like an
 *  empty screen list. `unknown_command` is also a success with an empty house: an integration
 *  older than this list still serves screens. An answer without `appareils` is the same case one
 *  step later: the new `dist/` reaches the tablets before Home Assistant restarts on the new
 *  component. Every other refusal maps exactly as for `chargerEcran`. */
export async function loadHouse(cx: TransportConfig): Promise<Result<House>> {
  try {
    const brut = await cx.envoyerCommande({ type: 'home_desk/maison' }) as
      { sources?: unknown; appareils?: unknown } | null | undefined;
    const sources = brut?.sources;
    const appareils = brut?.appareils ?? [];
    if (!Array.isArray(sources) || !Array.isArray(appareils)) return { ok: false, panne: 'corrompu' };
    return { ok: true, value: { sources: sources as DeclarationSource[], appareils: appareils as Appareil[] } };
  } catch (error) {
    if (error instanceof RefusHA && error.code === 'unknown_command') return { ok: true, value: EMPTY_HOUSE };
    return { ok: false, panne: panneDe(error) };
  }
}
