/** What the engine reads on the survey taken BEFORE a painting, while its nodes still show the
 *  old content. Moved out of `moteur.ts` on 2026-11-07 (500-line limit): that file plays the
 *  verdicts, this one prepares what they will need from the screen as it was.
 *
 *  The engine's survey type predates the rule that code is written in English; the lines that
 *  must name it carry the policy marker. */
import { figerTypographie, type Marque as Mark } from './marques';  // policy: allow-fr
import type { Verdict } from './diff';

/** `data-mvt-swap`: a mark whose content change plays as a swap (`swap.ts`) — the old look
 *  dissolving over the new one — rather than nothing. Opt-in, because the same role covers both
 *  kinds: the summary line swaps its text, a task line arms at once on purpose. */
export const swapsOnChange = (el: HTMLElement): boolean => el.dataset.mvtSwap !== undefined;

/** A clone of `el` as it is painted now. An opted-in mark is often not self-contained: a card
 *  button takes its disc colour from custom properties set on the card, a chip its colours from
 *  the view. Its ghost is reparented under the ghost layer and would lose them, so the resolved
 *  colours and typography are written on the clone itself. */
function frozenClone(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  figerTypographie(el, clone);  // policy: allow-fr
  const s = getComputedStyle(el);
  if (s.backgroundColor) clone.style.setProperty('background-color', s.backgroundColor);
  if (s.color) clone.style.setProperty('color', s.color);
  return clone;
}

/** Prepares the survey taken before a painting:
 *  - a command TILE and an opted-in mark are rewritten in place by `lit`, so their old look is
 *    cloned now, just before the painting — never at the previous survey, which a gauge slid by
 *    the finger since then (`geste.ts` writes `--jauge` directly) would contradict;
 *  - the declarations inside the muted element are listed while they are still inside it: after
 *    the painting, the nodes that left are detached and inside nothing.
 *  Returns those muted declarations. */
export function prepareBefore(before: Map<string, Mark>, mutedEl: HTMLElement | null): Set<string> {
  const keys = new Set<string>();
  for (const [decl, m] of before) {
    if (m.el.isConnected) {
      if (swapsOnChange(m.el)) m.copie = frozenClone(m.el);  // policy: allow-fr
      else if (m.role === 'tuile') m.copie = m.el.cloneNode(true) as HTMLElement;  // policy: allow-fr
    }
    if (mutedEl !== null && mutedEl.contains(m.el)) keys.add(decl);
  }
  return keys;
}

/** True when the verdict concerns content inside the muted element. */
export function isMuted(v: Verdict, mutedEl: HTMLElement, keys: Set<string>): boolean {
  const inside = (m: Mark) => keys.has(`${m.role}:${m.cle}`) || mutedEl.contains(m.el);  // policy: allow-fr
  if (v.type === 'traversee' || v.type === 'dissolve') return false;  // policy: allow-fr
  if (v.type === 'croisement') return inside(v.sortante) || inside(v.entrante);  // policy: allow-fr
  return inside(v.marque);  // policy: allow-fr
}
