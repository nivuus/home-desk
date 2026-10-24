/** What a card reads of an entity, in one place: its state when it can be read, its name when
 *  Home Assistant gives one. `unavailable` and `unknown` are an entity that has nothing to say:
 *  a role in that state is absent from the card (its line, its button), never "off" or zero. */
import type { Etat } from '../etat';

export const stateOf = (etat: Etat, id: string | undefined): string | undefined =>
  id !== undefined && etat.estUtilisable(id) ? etat.lire(id)!.etat : undefined;

export function attributeOf(etat: Etat, id: string | undefined, name: string): unknown {
  return id === undefined ? undefined : etat.lire(id)?.attributs[name];
}

/** The entity's `friendly_name`, or undefined: text from Home Assistant, to be shown `dir="auto"`. */
export function nameOf(etat: Etat, id: string | undefined): string | undefined {
  const name = attributeOf(etat, id, 'friendly_name');
  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
}
