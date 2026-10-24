/** The card types the stack knows, read from the source of truth (`src/stack/types.ts`), so a
 *  type added there without a render fixture fails `verifier-pile.mjs` instead of slipping
 *  through a hand-copied list. */
import { readFileSync } from 'node:fs';

const TYPES_SOURCE = new URL('../src/stack/types.ts', import.meta.url);

/** The members of the `CardType` union, in source order. Throws if the union cannot be read:
 *  an empty list would make the coverage check vacuous. */
export function cardTypes(source = readFileSync(TYPES_SOURCE, 'utf8')) {
  const union = /export type CardType\s*=([^;]*);/.exec(source);
  const types = union ? [...union[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  if (types.length === 0) throw new Error('verifier-pile: no CardType union found in src/stack/types.ts');
  return types;
}
