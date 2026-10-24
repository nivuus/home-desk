/** The AMS row of the printer card: one disc per tray, in the spool's colour, the tray that feeds
 *  the print drawn larger, an empty tray an empty ring.
 *
 *  ha-bambulab, `custom_components/bambu_lab/definitions.py` (`_tray_sensor`): each tray sensor's
 *  state is the filament name and its attributes carry `color` (`f"#{tray.color}"`, RRGGBBAA,
 *  `pybambu/models.py` `AMSTray.color`, "00000000" by default), `empty` (no usable spool:
 *  slot empty, feeding or scanning, `docs/entities.mdx`) and `active` (`AMSList`: the tray of
 *  the active AMS whose index is the active tray).
 *
 *  A spool's colour can be anything, the card's own background too: each disc sits on the row's
 *  solid pill (the secondary disc colour, like the stack's dots) and wears two rings — the
 *  outer one in the pill's icon colour, ≥ 4.5:1 against the pill by the tones' guarantee, the
 *  inner one black or white, whichever contrasts more with the spool (always ≥ 4.5:1). */
import { html, type TemplateResult } from 'lit';
import type { Etat } from '../etat';

/** An opaque `#RRGGBB`, from `#RRGGBB` or `#RRGGBBAA`; anything else is no colour. The alpha is
 *  dropped: a translucent filament drawn translucent would show the pill, not the spool. */
export function spoolColour(raw: unknown): string | null {
  const m = typeof raw === 'string' ? /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(raw) : null;
  return m === null ? null : `#${m[1]}`;
}

const linear = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

/** Black or white, whichever has the higher WCAG contrast with `hex` (`#RRGGBB`). */
export function ringFor(hex: string): '#000000' | '#ffffff' {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const l = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#ffffff';
}

function spool(etat: Etat, id: string): TemplateResult | '' {
  // A tray Home Assistant cannot read has nothing to draw: its place is left out.
  if (!etat.estUtilisable(id)) return '';
  const e = etat.lire(id)!;
  const colour = e.attributs['empty'] === true ? null : spoolColour(e.attributs['color']);
  const active = e.attributs['active'] === true;
  const style = colour === null ? '' : `--bobine:${colour};--bobine-bord:${ringFor(colour)};`;
  // The name is the integration's filament name, in any script; read by assistive technology.
  return html`<span class="bobine ${colour === null ? 'vide' : ''} ${active ? 'en-cours' : ''}"
    role="img" aria-label=${e.etat} aria-current=${active ? 'true' : 'false'} style=${style}></span>`;
}

/** The row, or nothing when no tray is declared or none can be read. */
export function spoolRow(etat: Etat, trays: string[] | undefined): TemplateResult | '' {
  const discs = (trays ?? []).map((id) => spool(etat, id)).filter((d) => d !== '');
  return discs.length === 0 ? '' : html`<div class="bobines">${discs}</div>`;
}
