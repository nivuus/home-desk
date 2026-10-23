/** Which media source the card shows: the screen's own sources first, then what plays elsewhere
 *  in the house. Pure functions, no DOM. */
import { entitiesOf, type DeclarationSource, type SourceResolue } from './media';

/** House declarations that share no entity with any own declaration, house order kept. */
export function sourcesElsewhere(
  house: DeclarationSource[], own: DeclarationSource[],
): DeclarationSource[] {
  const taken = new Set<string>();
  for (const d of own) for (const id of entitiesOf(d)) taken.add(id);
  return house.filter((d) => ![...entitiesOf(d)].some((id) => taken.has(id)));
}

/** The identity a pin is stored under. `nom` alone is not unique across the house list (a "TV"
 *  in two rooms), so the room is part of the key. */
export function sourceKey(s: { nom: string; piece?: string }): string {
  return JSON.stringify([s.piece ?? '', s.nom]);
}

/** First own source that plays; else the first remote one that is actively playing; else the
 *  pinned remote one (a `sourceKey`) while it is still `joue` (so a pause does not make it vanish); else none. */
export function pickSource(
  own: SourceResolue[], elsewhere: SourceResolue[], pinned?: string,
): { source?: SourceResolue; remote: boolean } {
  const mine = own.find((s) => s.joue);
  if (mine !== undefined) return { source: mine, remote: false };
  const active = elsewhere.find((s) => s.active);
  if (active !== undefined) return { source: active, remote: true };
  const kept = pinned === undefined
    ? undefined : elsewhere.find((s) => sourceKey(s) === pinned && s.joue);
  if (kept !== undefined) return { source: kept, remote: true };
  return { remote: false };
}

/** The pin (a `sourceKey`) that survives this frame: kept only while the pinned source is the remote one shown.
 *  Once it stops (idle), an own source plays or another remote source takes over, the pin goes,
 *  so a later pause of that source elsewhere does not bring the card back. */
export function settlePin(
  shown: { source?: SourceResolue; remote: boolean }, pinned?: string,
): string | undefined {
  return pinned !== undefined && shown.remote && shown.source !== undefined
    && sourceKey(shown.source) === pinned ? pinned : undefined;
}
