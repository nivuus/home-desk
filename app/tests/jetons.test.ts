import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = () => readFileSync(new URL('../src/styles/jetons.css', import.meta.url), 'utf8');

describe('jetons Material 3', () => {
  it('produit un primaire teal en schéma clair', () => {
    expect(css()).toContain('--md-primary:#003c48');
  });

  it('produit des surfaces froides, jamais rosées', () => {
    // Une graine rose non compensée donnerait #fff8f8 : c'est le défaut qu'on prévient.
    expect(css()).toContain('--md-surface:#f5fafc');
    expect(css()).not.toContain('#fff8f8');
  });

  it('définit les deux schémas', () => {
    expect(css()).toMatch(/\.m3\s*\{/);
    expect(css()).toMatch(/\.m3\.sombre\s*\{/);
  });

  it('ne contient aucune paire on-X / X sous 5:1', () => {
    // Chaque schéma définit les 34 mêmes noms de rôle : fusionner les deux blocs dans une
    // seule table (via matchAll sur le fichier entier) ne conserverait que la dernière
    // occurrence de chaque clé, donc uniquement le schéma sombre. On extrait et vérifie
    // les deux blocs séparément, en nommant le schéma fautif dans le message d'échec.
    const texte = css();
    const bloc = (motif: RegExp) => {
      const m = texte.match(motif);
      if (!m) throw new Error(`bloc introuvable pour ${motif}`);
      return Object.fromEntries(
        [...m[1].matchAll(/--md-([a-z-]+):(#[0-9a-f]{6})/g)].map(mm => [mm[1], mm[2]]));
    };
    const clair = bloc(/\.m3\s*\{([^}]*)\}/);
    const sombre = bloc(/\.m3\.sombre\s*\{([^}]*)\}/);

    const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const L = (h: string) => 0.2126 * lin(parseInt(h.slice(1, 3), 16))
      + 0.7152 * lin(parseInt(h.slice(3, 5), 16)) + 0.0722 * lin(parseInt(h.slice(5, 7), 16));

    const verifie = (nomSchema: string, t: Record<string, string>) => {
      for (const [nom, val] of Object.entries(t)) {
        if (!nom.startsWith('on-')) continue;
        const fond = t[nom.slice(3)];
        if (!fond) continue;
        const [a, b] = [L(val), L(fond)];
        const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        expect(r, `${nomSchema} : ${nom} sur ${nom.slice(3)}`).toBeGreaterThanOrEqual(5);
      }
    };
    verifie('clair', clair);
    verifie('sombre', sombre);
  });
});
