/* Copie les fichiers de `assets/` vers le dossier servi par Home Assistant.
 *
 * Depuis le retrait des scènes codées en dur (2026-09-28 : leurs vidéos et leur image sont
 * parties avec elles), `assets/` ne contient plus que les deux polices DSEG, déclarées par le bloc
 * `@font-face` de `base.css`. Rollup ne connaît que ce que le code importe : un fichier référencé
 * par URL absolue (`/local/wallpanel/assets/…`) n'est emmené par rien, et sans cette étape le
 * bundle partirait en production avec des chemins qui répondent 404.
 *
 * Pourquoi des fichiers plutôt que des data-URI : embarqués dans `wallpanel.css`/`wallpanel.js`,
 * ils seraient téléchargés par les TROIS tablettes à chaque changement de version, qu'elles s'en
 * servent ou non.
 *
 * La copie est conditionnelle (taille + date) : réécrire un fichier inchangé à chaque build ferait
 * tourner le cache de Home Assistant pour rien.
 */
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, '..', 'assets');
// Meme raison que rollup.config.js : la sortie est relative au depot. Les
// fichiers d'assets sont DUPLIQUES dans dist/ a dessein — c'est ce qui rend
// dist/ complet, donc deposable par un seul replace_tree() atomique. Le repertoire est relu par trois clients
// qui rechargent tout seuls ; deux gestes de depot y ouvriraient une fenetre.
const SORTIE = join(ICI, '..', '..', 'dist', 'assets');

mkdirSync(SORTIE, { recursive: true });

let copies = 0;
let inchanges = 0;
for (const nom of readdirSync(SOURCE)) {
  const depuis = join(SOURCE, nom);
  const vers = join(SORTIE, nom);
  const src = statSync(depuis);
  if (existsSync(vers)) {
    const dst = statSync(vers);
    if (dst.size === src.size && dst.mtimeMs >= src.mtimeMs) { inchanges++; continue; }
  }
  copyFileSync(depuis, vers);
  copies++;
}

console.log(`assets : ${copies} copié(s), ${inchanges} inchangé(s) → ${SORTIE}`);
