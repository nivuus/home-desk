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

/** Spec order ("Ce qui est suivi"): the first own source that plays (paused included); else the
 *  pinned remote source (a `sourceKey`) while it is still `joue`, so the play button of a source
 *  paused from here never vanishes under the finger, even while another room plays; else the
 *  first remote source that is actively playing (house order); else none. */
export function pickSource(
  own: SourceResolue[], elsewhere: SourceResolue[], pinned?: string,
): { source?: SourceResolue; remote: boolean } {
  const mine = own.find((s) => s.joue);
  if (mine !== undefined) return { source: mine, remote: false };
  const kept = pinned === undefined
    ? undefined : elsewhere.find((s) => sourceKey(s) === pinned && s.joue);
  if (kept !== undefined) return { source: kept, remote: true };
  const active = elsewhere.find((s) => s.active);
  if (active !== undefined) return { source: active, remote: true };
  return { remote: false };
}

/** A remote source paused FROM this tablet (`rendu/media.ts`). `paused` turns true on the first
 *  frame that shows it paused: until then the pause has not reached Home Assistant yet, and the
 *  source still playing is no reason to drop the pin. */
export type MediaPin = { key: string; paused: boolean };

/** The pin that survives this frame: kept only while the pinned source is the remote one shown.
 *  It is for the pause it was set for: once that source plays again AFTER being seen paused,
 *  stops (idle), an own source plays or another remote source takes over, the pin goes, so a
 *  later pause of that source elsewhere does not bring the card back. */
export function settlePin(
  shown: { source?: SourceResolue; remote: boolean }, pin?: MediaPin,
): MediaPin | undefined {
  if (pin === undefined || !shown.remote || shown.source === undefined
    || sourceKey(shown.source) !== pin.key) return undefined;
  if (!shown.source.active) return { key: pin.key, paused: true };
  return pin.paused ? undefined : pin;
}
