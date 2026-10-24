/** The pantry card (rank 5): a batch nears its date or a product runs short. Screen-sourced: the
 *  two home-stock binary sensors, on a screen that declares the pantry view (`#garde-manger`).
 *  Their thresholds are home-stock's own.
 *
 *  Lists the first three products: the expiring batches first (attribute `batches`, each with a
 *  `product_name`), then the shortages (attribute `products`), a product once. More than three:
 *  the subtitle says how many are hidden. A sensor that is `unavailable` or `unknown` is absent. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import { CAPTEUR_EXPIRATIONS, CAPTEUR_MANQUES } from '../garde-manger';
import type { CardFrame } from '../rendu/card-frame';
import type { Card } from '../stack/types';
import { laterButton } from './actions';
import { declaresView, shoppingButton } from './kitchen';
import { attributeOf, stateOf } from './readings';
import { S } from './strings';

const MAX_PRODUCTS = 3;
const keyOf = (): string => `garde-manger:${CAPTEUR_EXPIRATIONS}`;
const raised = (s: ScreenState, id: string): boolean => stateOf(s.etat, id) === 'on';

const names = (v: unknown, pick: (x: unknown) => unknown): string[] =>
  (Array.isArray(v) ? v : []).map(pick).filter((n): n is string => typeof n === 'string' && n.trim() !== '');

/** Every concerned product, once, in the order they are listed. */
function products(s: ScreenState): string[] {
  const all = [
    ...(raised(s, CAPTEUR_EXPIRATIONS)
      ? names(attributeOf(s.etat, CAPTEUR_EXPIRATIONS, 'batches'), (b) => (b as { product_name?: unknown } | null)?.product_name) : []),
    ...(raised(s, CAPTEUR_MANQUES) ? names(attributeOf(s.etat, CAPTEUR_MANQUES, 'products'), (n) => n) : []),
  ];
  return [...new Set(all)];
}

export function detect(_f: Frame, s: ScreenState): Card[] {
  const on = raised(s, CAPTEUR_EXPIRATIONS) || raised(s, CAPTEUR_MANQUES);
  return on && declaresView(s, '#garde-manger') ? [{ key: keyOf(), type: 'garde-manger', rank: 5 }] : [];
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const all = products(s);
  const hidden = all.length - MAX_PRODUCTS;
  return {
    key: card.key,
    label: S.pantryLabel,
    title: S.pantry,
    ...(hidden > 0 ? { subtitle: S.pantryMore(new Intl.NumberFormat().format(hidden)) } : {}),
    middle: html`${all.slice(0, MAX_PRODUCTS).map((n) => html`<div class="carte-ligne" dir="auto">${n}</div>`)}`,
    buttons: [laterButton(s, card.key, false),
      { icon: 'jar', label: S.pantryOpen, primary: true, act: () => { location.hash = '#garde-manger'; } },
      shoppingButton(s)],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:garde-manger' },
  };
}
