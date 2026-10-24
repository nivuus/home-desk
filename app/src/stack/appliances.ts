/** Where a house appliance's card appears (spec 2026-10-24, "Configuration"): an appliance of the
 *  screen's room always; one declared for the whole house (`"maison"`) only while its card waits
 *  for a gesture (rank 2), on every tablet. And the one merge of the screen's own declaration of a
 *  card with the appliances that declare the same one.
 *
 *  A card module reads appliances through `cardEntities` and nothing else: a later card type only
 *  needs its adapter (roles → its own entity shape), its key and its rank. */
import type { ScreenState } from '../boot/state';
import type { Appareil, ApplianceType } from '../configuration';
import type { Rank } from './types';

/** The `piece` of an appliance shown everywhere. Not a room: no screen is "in" it. */
export const WHOLE_HOUSE = 'maison';

/** Room names compare exactly as configured, in any script: the same string the screen's `nom`
 *  and the appliance's `piece` were typed as. */
export function appliancesFor(house: Appareil[], room: string, rank: (a: Appareil) => Rank | null): Appareil[] {
  return house.filter((a) => (a.piece === WHOLE_HOUSE ? rank(a) === 2 : a.piece === room));
}

/** One single-entity role of an appliance; a list role or an absent one is `undefined`. */
export function role(a: Appareil, name: string): string | undefined {
  const v = a.entites[name];
  return typeof v === 'string' ? v : undefined;
}

/** A role the contract requires for this type: its absence is a corrupt house, never a card. */
export function requiredRole(a: Appareil, name: string): string {
  const v = role(a, name);
  if (v === undefined) throw new Error(`house: ${a.type} in ${a.piece} declares no ${name}`);
  return v;
}

/** `first` field by field, `second` filling only what `first` leaves undeclared. */
function union<E extends object>(first: E, second: E): E {
  const out = { ...second } as Record<string, unknown>;
  for (const [k, v] of Object.entries(first)) if (v !== undefined) out[k] = v;
  return out as E;
}

export type CardSource<E> = {
  type: ApplianceType;
  /** The screen's own declaration of this card, in the card's shape, when it has one. */
  own: E | undefined;
  adapt: (a: Appareil) => E;
  key: (e: E) => string;
  rank: (s: ScreenState, e: E) => Rank | null;
};

/** The entities of every card of one type this screen shows, one per card key. Every declaration
 *  of a key is merged first — the screen's own wins field by field, being the more specific, then
 *  the room's appliances, then the house's — and only then is the card's visibility decided, on
 *  that merged shape: the rank a house appliance is judged by is the one its card would have. */
export function cardEntities<E extends object>(s: ScreenState, src: CardSource<E>): E[] {
  const room = s.piece.nom;
  const candidates = s.house.appareils
    .filter((a) => a.type === src.type && (a.piece === room || a.piece === WHOLE_HOUSE))
    // Stable: the room's appliances before the house's, each kept in its declared order.
    .sort((a, b) => Number(a.piece === WHOLE_HOUSE) - Number(b.piece === WHOLE_HOUSE));
  const byKey = new Map<string, E>();
  const declare = (e: E): void => {
    const k = src.key(e);
    const known = byKey.get(k);
    byKey.set(k, known === undefined ? e : union(known, e));
  };
  if (src.own !== undefined) declare(src.own);
  for (const a of candidates) declare(src.adapt(a));
  const shown = new Set(appliancesFor(candidates, room, (a) => src.rank(s, byKey.get(src.key(src.adapt(a)))!))
    .map((a) => src.key(src.adapt(a))));
  if (src.own !== undefined) shown.add(src.key(src.own));
  return [...byKey].filter(([k]) => shown.has(k)).map(([, e]) => e);
}
