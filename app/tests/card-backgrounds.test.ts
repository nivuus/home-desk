import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOLID_TOKENS, type SolidToken } from '../src/rendu/card-frame';
import { contrastRatio, relativeLuminance } from '../src/tones';

/** The real stylesheet, comments stripped: a colour only described in a comment is no colour. */
const css = readFileSync(join(process.cwd(), 'src/styles/cards.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** One colour of a solid token, read from its `--carte-<token>-<role>` custom property. */
function colour(token: SolidToken, role: string): string {
  const m = new RegExp(`--carte-${token}-${role}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (m === null) throw new Error(`cards.css declares no solid --carte-${token}-${role}`);
  return m[1];
}

function tokenColours(token: SolidToken) {
  return { fond: colour(token, 'fond'), texte: colour(token, 'texte'), icone: colour(token, 'icone'),
    disque: colour(token, 'disque'), primaire: colour(token, 'primaire'),
    surPrimaire: colour(token, 'sur-primaire') };
}

const lum = (hex: string): number => relativeLuminance(
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));

describe('solid card backgrounds', () => {
  it.each(SOLID_TOKENS)('solid %s: text ≥ 5:1, icons ≥ 4.5:1', (token) => {
    const { fond, texte, icone, disque, primaire, surPrimaire } = tokenColours(token);
    expect(contrastRatio(lum(fond), lum(texte))).toBeGreaterThanOrEqual(5);
    expect(contrastRatio(lum(fond), lum(icone))).toBeGreaterThanOrEqual(4.5);
    // The icons sit on discs: each one must also read on its own disc.
    expect(contrastRatio(lum(disque), lum(icone))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lum(primaire), lum(surPrimaire))).toBeGreaterThanOrEqual(4.5);
  });

  it('an inert button is a solid pair with its icon ≥ 4.5:1, never an opacity', () => {
    const hex = (role: string) => {
      const m = new RegExp(`--carte-inerte-${role}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
      if (m === null) throw new Error(`cards.css declares no solid --carte-inerte-${role}`);
      return m[1];
    };
    expect(contrastRatio(lum(hex('disque')), lum(hex('icone')))).toBeGreaterThanOrEqual(4.5);
    const rule = /\.disque\.inerte[^{]*\{([^}]*)\}/.exec(css);
    expect(rule, '.disque.inerte rule').not.toBeNull();
    expect(rule![1]).toMatch(/background:\s*var\(--carte-inerte-disque\)/);
    expect(rule![1]).toMatch(/color:\s*var\(--carte-inerte-icone\)/);
    // No opacity on an inert disc, whatever rule carries it.
    // (`:not(.inerte)` names the OTHER buttons: their press feedback, not an inert disc.)
    const inertRules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => m[1].replace(/:not\(\.inerte\)/g, '').includes('.inerte'));
    expect(inertRules.length).toBeGreaterThan(0);
    for (const m of inertRules) expect(m[2], m[1].trim()).not.toMatch(/(^|[;\s])opacity:/);
  });

  it('the stack dots wear the disc pair, so every background keeps them at the icons\' 4.5:1', () => {
    // Solid tokens: the pair tested above; images: their tones (`verifier-carte-media.mjs`, rule 4).
    const rule = (sel: string) => new RegExp(`${sel.replace(/[.>]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)![1];
    const disc = rule('.disque');
    const fill = /background:\s*([^;]+);/.exec(disc)![1];
    const ink = /color:\s*([^;]+);/.exec(disc)![1];
    expect(rule('.carte .points')).toContain(`background: ${fill};`);
    expect(rule('.carte .points > span')).toContain(`background: ${ink};`);
  });

  it('no gradient anywhere in the card sheet', () => {
    expect(css).not.toMatch(/gradient\(/);
  });

  it('the image layer is shown untouched: no opacity, no filter', () => {
    const layer = /\.carte-image\s*\{([^}]*)\}/.exec(css);
    expect(layer, '.carte-image rule').not.toBeNull();
    expect(layer![1]).not.toMatch(/opacity|filter/);
    expect(layer![1]).toMatch(/background-size:\s*cover/);
  });

  it('the label takes the card colour, never the global .etiquette of base.css', () => {
    // `base.css` colours `.etiquette` with `--md-on-surface-variant`: on a card it painted the
    // label in a colour the tones never checked (1.26:1 measured on a mid-tone poster).
    const rule = /\.carte \.etiquette\s*\{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/color:\s*inherit/);
    expect(rule).toMatch(/margin:\s*0/);
  });

  it('the frame is 311 × 264, radius 28, with explicit line heights', () => {
    const root = /\.carte\s*\{([^}]*)\}/.exec(css)![1];
    expect(root).toMatch(/width:\s*311px/);
    expect(root).toMatch(/height:\s*264px/);
    expect(root).toMatch(/flex:\s*none/);   // never squeezed by the column it sits in
    expect(root).toMatch(/border-radius:\s*28px/);
    for (const sel of ['etiquette', 'titre', 'sous-titre']) {
      const rule = new RegExp(`\\.carte \\.${sel}\\s*\\{([^}]*)\\}`).exec(css);
      expect(rule, sel).not.toBeNull();
      expect(rule![1], sel).toMatch(/line-height:\s*[\d.]+/);
    }
  });
});
