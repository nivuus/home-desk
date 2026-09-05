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
import { join } from 'node:path';

// 2026-08-28 : la configuration de Home Assistant a été déplacée de
// /opt/nivuus/HomeAssistant/config vers /opt/nivuus/home-manager/config (c'est ce dossier-là
// que docker-compose monte sur /config, cf. docker-compose.yml). L'ancien chemin n'existe
// plus du tout : un build qui y écrivait recréait un dossier orphelin que personne ne sert,
// et les tablettes continuaient d'afficher l'ancien bundle sans le moindre message d'erreur.
const SORTIE = '/opt/nivuus/home-manager/config/www/wallpanel';
const empreinte = createHash('sha256')
  .update(readFileSync(join(SORTIE, 'wallpanel.js')))
  .update(readFileSync(join(SORTIE, 'wallpanel.css')))
  .digest('hex').slice(0, 10);

let n = 0;
for (const f of readdirSync(SORTIE).filter((x) => x.endsWith('.html'))) {
  const chemin = join(SORTIE, f);
  const avant = readFileSync(chemin, 'utf8');
  const apres = avant
    .replace(/(\/local\/wallpanel\/wallpanel\.(?:js|css))(\?v=[0-9a-f]+)?/g, `$1?v=${empreinte}`);
  if (apres !== avant) { writeFileSync(chemin, apres); n++; }
}
console.log(`empreinte ${empreinte} posée sur ${n} page(s)`);
