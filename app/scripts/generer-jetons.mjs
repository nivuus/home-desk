// Génère les jetons Material 3 Expressive.
// Accents  : SchemeExpressive, graine HCT(338,48,40) → primaire teal #003c48.
//            Le schéma Expressive applique une forte rotation de teinte ; cette graine-là
//            retombe à 0,8° du #0D5D6D de la charte.
// Neutres  : SchemeTonalSpot depuis #0D5D6D, sinon la graine rose teinte les surfaces.
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Écart au brief : le fichier temporaire vit hors de l'arborescence du projet, donc la
// remontée de répertoires d'esbuild ne croise jamais notre node_modules. On lui indique le
// chemin explicitement via nodePaths (calculé depuis ce script, pas depuis le cwd).
const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));

const SOURCE = `
import { argbFromHex, hexFromArgb, Hct, DynamicScheme, Variant,
         SchemeExpressive, SchemeTonalSpot, MaterialDynamicColors }
  from '@material/material-color-utilities';

const ACCENTS = Hct.from(338, 48, 40);
const NEUTRES = Hct.fromInt(argbFromHex('#0D5D6D'));
const ROLES = ['primary','onPrimary','primaryContainer','onPrimaryContainer',
  'secondary','onSecondary','secondaryContainer','onSecondaryContainer',
  'tertiary','onTertiary','tertiaryContainer','onTertiaryContainer',
  'error','onError','errorContainer','onErrorContainer',
  'surface','onSurface','surfaceVariant','onSurfaceVariant','surfaceDim','surfaceBright',
  'surfaceContainerLowest','surfaceContainerLow','surfaceContainer','surfaceContainerHigh',
  'surfaceContainerHighest','outline','outlineVariant','inverseSurface','inverseOnSurface',
  'inversePrimary','scrim','shadow'];

const composer = (sombre) => {
  const a = new SchemeExpressive(ACCENTS, sombre, 0.5);
  const n = new SchemeTonalSpot(NEUTRES, sombre, 0.5);
  return new DynamicScheme({
    sourceColorHct: ACCENTS, variant: Variant.EXPRESSIVE, contrastLevel: 0.5, isDark: sombre,
    primaryPalette: a.primaryPalette, secondaryPalette: a.secondaryPalette,
    tertiaryPalette: a.tertiaryPalette,
    neutralPalette: n.neutralPalette, neutralVariantPalette: n.neutralVariantPalette,
  });
};
const kebab = (r) => r.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const bloc = (sombre) => ROLES
  .map((r) => '  --md-' + kebab(r) + ':' + hexFromArgb(MaterialDynamicColors[r].getArgb(composer(sombre))) + ';')
  .join('\\n');

console.log('/* Jetons Material 3 Expressive — GÉNÉRÉ par scripts/generer-jetons.mjs.');
console.log('   Ne jamais éditer à la main : changer une couleur veut dire changer la graine. */');
console.log('.m3 {\\n' + bloc(false) + '\\n  --sh-s:8px; --sh-m:12px; --sh-l:16px; --sh-xl:28px; --sh-full:999px;\\n}');
console.log('.m3.sombre {\\n' + bloc(true) + '\\n}');
`;

const dir = mkdtempSync(join(tmpdir(), 'jetons-'));
const entree = join(dir, 'entree.mjs');
writeFileSync(entree, SOURCE);
const sortie = join(dir, 'sortie.cjs');
await build({ entryPoints: [entree], bundle: true, platform: 'node',
              format: 'cjs', outfile: sortie, logLevel: 'error',
              nodePaths: [join(RACINE, 'node_modules')] });
await import(sortie);
