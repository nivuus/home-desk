/** Genere les trois pages d'entree des tablettes depuis un gabarit unique.
 *
 *  Avant le 2026-09-04 elles etaient ecrites A LA MAIN et versionnees NULLE
 *  PART : `git ls-files | grep html` ne rendait rien dans le depot d'origine.
 *  Elles sont pourtant le point d'entree reel des trois Fire 7 — la `startUrl`
 *  de Fully pointe sur `/local/wallpanel/<piece>.html`. Les perdre, c'etait
 *  perdre le demarrage des tablettes sans qu'aucun test ne s'en apercoive.
 *
 *  L'empreinte est posee par versionner.mjs APRES ce script : ici on ecrit le
 *  jeton @EMPREINTE@, qui n'a de valeur qu'une fois le bundle construit.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const GABARIT = join(ICI, '..', 'gabarits', 'piece.html');
const SORTIE = join(ICI, '..', '..', 'dist');

/** Les trois pieces, et le titre que porte l'onglet de chacune.
 *  La liste est ici et pas dans `src/ecran.ts` a dessein : ce script tourne
 *  sous node avant toute compilation TypeScript. */
const PIECES = [
  { piece: 'salon', titre: 'Salon' },
  { piece: 'bureau', titre: 'Bureau' },
  { piece: 'cuisine', titre: 'Cuisine' },
];

mkdirSync(SORTIE, { recursive: true });
const gabarit = readFileSync(GABARIT, 'utf8');

for (const { piece, titre } of PIECES) {
  const page = gabarit
    .replaceAll('@TITRE@', titre)
    .replaceAll('@PIECE@', piece);
  writeFileSync(join(SORTIE, `${piece}.html`), page);
}
console.log(`pages : ${PIECES.length} generees -> ${SORTIE}`);

/** La page unique de la spec du 2026-09-12 : l'identite vient de `?ecran=`, pas du fichier.
 *
 *  Produite EN PLUS des trois pages historiques, pas a leur place, pendant toute la duree de la
 *  migration : `hooks/install.py` remplace `www/wallpanel/` en entier, donc une page absente de
 *  `dist/` disparait de la cible au prochain depot. Les trois historiques ne partent qu a
 *  l'etape 8 de la mise en production (plan 3c), avec la branche de transition de `src/page.ts`.
 *
 *  Le nom de fichier est EXPLICITE, et ce n'est pas une coquetterie : `/local/wallpanel/`
 *  (le repertoire) rend 403. Home Assistant sert `/local/` par
 *  `CachingStaticResource`, qui sous-classe `StaticResource` d'aiohttp sans toucher au
 *  traitement des repertoires ; `show_index` vaut False par defaut et
 *  `_resolve_path_to_response` leve alors `HTTPForbidden`. aiohttp ne sert JAMAIS `index.html`
 *  implicitement. La `startURL` des tablettes est donc
 *  `/local/wallpanel/index.html?ecran=<nom>`.
 */
const GABARIT_UNIQUE = join(ICI, '..', 'gabarits', 'index.html');
writeFileSync(join(SORTIE, 'index.html'), readFileSync(GABARIT_UNIQUE, 'utf8'));
console.log(`page unique : index.html -> ${SORTIE}`);
