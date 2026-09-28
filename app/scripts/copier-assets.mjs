/* Copies into `dist/assets/` the files the code points at by absolute URL
 * (`/local/wallpanel/assets/…`): rollup only knows what the code imports, nothing carries a file
 * referenced by URL, and without this step the bundle would reach production with paths that
 * answer 404.
 *
 * Since 2026-09-28 the only occupant is the Lottie player's WASM (`@lottiefiles/dotlottie-web`),
 * pointed at by `DotLottie.setWasmUrl` in `src/lottie.ts`: never a CDN, a tablet plays a Lottie
 * without internet. It is taken from `node_modules`, hence always the version the lock installs —
 * the same as `dist/dotlottie.js`. (The two DSEG fonts, dead with the DeLorean scenes, left the
 * same day, and `app/assets/` with them.)
 *
 * Why files rather than data URIs: embedded in a bundle, they would be downloaded by the THREE
 * tablets on every release, whether they use them or not.
 *
 * The copy is conditional (size + date): rewriting an unchanged file on every build would churn
 * Home Assistant's cache for nothing.
 */
import { copyFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const APP = join(ICI, '..');
// Same reason as rollup.config.js: the output is relative to the repository. The assets are
// DUPLICATED into dist/ on purpose — that is what makes dist/ complete, hence deployable by a
// single atomic replace_tree(). The directory is re-read by three clients that reload on their
// own; two deployment steps would open a window.
const SORTIE = join(APP, '..', 'dist', 'assets');

const SOURCES = [
  join(APP, 'node_modules', '@lottiefiles', 'dotlottie-web', 'dist', 'dotlottie-player.wasm'),
];

mkdirSync(SORTIE, { recursive: true });

let copies = 0;
let inchanges = 0;
for (const depuis of SOURCES) {
  const vers = join(SORTIE, basename(depuis));
  const src = statSync(depuis);
  if (existsSync(vers)) {
    const dst = statSync(vers);
    if (dst.size === src.size && dst.mtimeMs >= src.mtimeMs) { inchanges++; continue; }
  }
  copyFileSync(depuis, vers);
  copies++;
}

console.log(`assets: ${copies} copied, ${inchanges} unchanged -> ${SORTIE}`);
