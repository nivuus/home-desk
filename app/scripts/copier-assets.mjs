/* Copie les fichiers média de `assets/` vers le dossier servi par Home Assistant.
 *
 * Rollup ne connaît que ce que le code importe : les vidéos, l'image et les polices de la scène
 * DeLorean sont référencées par URL absolue (`/local/wallpanel/assets/…`, cf. `rendu/delorean.ts`
 * et le bloc `@font-face` de `base.css`), donc rien ne les emmène. Sans cette étape, le bundle
 * partirait en production avec des chemins qui répondent 404 — visible seulement le jour d'un
 * rendez-vous DeLorean, c'est-à-dire trop tard.
 *
 * Pourquoi des fichiers plutôt que des data-URI : les 11 ko de polices et les 400 ko de vidéo
 * seraient sinon embarqués dans `wallpanel.css`/`wallpanel.js`, donc téléchargés par les TROIS
 * tablettes à chaque changement de version, y compris la cuisine et le bureau qui ne jouent
 * jamais la scène. Ici, seul le salon les demande, et seulement quand il en a besoin.
 *
 * La copie est conditionnelle (taille + date) : réécrire 400 ko à chaque build ferait tourner le
 * cache de Home Assistant pour rien.
 */
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, '..', 'assets');
// Meme raison que rollup.config.js : la sortie est relative au depot. Les cinq
// fichiers d'assets (411 Ko, inchanges depuis le 2026-08-21) sont DUPLIQUES
// dans dist/ a dessein — c'est ce qui rend dist/ complet, donc deposable par
// un seul replace_tree() atomique. Le repertoire est relu par trois clients
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
