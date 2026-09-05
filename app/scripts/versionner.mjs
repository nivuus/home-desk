/* Ajoute une empreinte de version aux références du bundle dans les pages HTML servies.
 *
 * Home Assistant sert `/local/` avec `Cache-Control: max-age=2678400` — trente et un jours.
 * Sans empreinte, une tablette peut garder des semaines une version périmée du code : plusieurs
 * déploiements du 2026-08-02 ne sont jamais arrivés à l'écran, et l'ordre de vidage de cache de
 * Fully ne s'est pas montré fiable. L'empreinte change à chaque construction, donc l'URL change,
 * donc le cache est contourné par construction plutôt que par une commande à ne pas oublier.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));

// Meme raison que rollup.config.js : la sortie est relative au depot.
const SORTIE = join(ICI, '..', '..', 'dist');

const empreinte = createHash('sha256')
  .update(readFileSync(join(SORTIE, 'wallpanel.js')))
  .update(readFileSync(join(SORTIE, 'wallpanel.css')))
  .digest('hex').slice(0, 10);

// Le groupe accepte AUSSI le jeton `@EMPREINTE@` que generer-pages.mjs laisse
// dans les pages fraichement produites depuis gabarits/piece.html. Sans lui,
// versionner.mjs prefixait son empreinte SANS consommer le jeton et produisait
// `?v=<empreinte>?v=@EMPREINTE@` — une URL que Home Assistant sert quand meme,
// mais qui n'est plus celle de la production. Constate le 2026-09-05 par la
// porte de fidelite du plan home-desk.
let n = 0;
for (const f of readdirSync(SORTIE).filter((x) => x.endsWith('.html'))) {
  const chemin = join(SORTIE, f);
  const avant = readFileSync(chemin, 'utf8');
  const apres = avant
    .replace(/(\/local\/wallpanel\/wallpanel\.(?:js|css))(\?v=(?:[0-9a-f]+|@EMPREINTE@))?/g,
      `$1?v=${empreinte}`);
  if (apres !== avant) { writeFileSync(chemin, apres); n++; }
}
console.log(`empreinte ${empreinte} posée sur ${n} page(s)`);
