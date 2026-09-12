#!/usr/bin/env node
/** Mesure la HAUTEUR RENDUE de chaque zone de l'écran, mode par mode, dans un vrai navigateur.
 *
 *  POURQUOI CET OUTIL EXISTE. `contrat/budget.json` portait une RÈGLE — « 0, 2 ou 4 commandes
 *  selon le mode » — calibrée pour les 585 px des Fire 7, pas un modèle de hauteurs. L'intégration
 *  Home Assistant (plan 3) doit pouvoir dire « cet écran déborde de tant » pour une tablette
 *  QUELCONQUE, ce qui exige de savoir ce que chaque zone coûte. Ces hauteurs n'avaient jamais été
 *  mesurées : `modes.ts` ne donnait que des TOTAUX d'écran (630 px en mode minuteur, 648 en mode
 *  voiture). Inventer un modèle pour faire semblant de calculer aurait été la pire issue possible.
 *
 *  CE QUI EST MESURÉ, ET COMMENT. Chaque zone porte un attribut `data-zone` (posé par
 *  `rendu/corps.ts` et les blocs de mode, cf. son commentaire) ; cet attribut est INERTE pour le
 *  rendu et n'a qu'un lecteur : ce fichier. Pour chaque mode, on relève le COÛT NET de la zone
 *  dans la colonne `.corps` — sa hauteur de boîte PLUS ses marges (celle de `.etiquette` est
 *  négative : −4 px, `base.css`) — puis on publie, zone par zone, le MAXIMUM sur tous les modes
 *  et toutes les pièces mesurés. Un budget doit tenir au pire cas ; il ne se calibre pas sur la
 *  moyenne.
 *
 *  LES ÉTATS NE SONT PAS CEUX DU MOMENT. Les modes sont posés avec `MODES`/`poserMode` de
 *  `verifier-rendu.mjs`, IMPORTÉS et jamais recopiés : cette table porte le pire cas RÉEL de
 *  chaque mode (états à injecter, page où le mode est atteignable, marqueur qui prouve qu'il est
 *  bien rendu), établi mesure après mesure depuis la tâche 13. Deux copies auraient divergé, et
 *  ce budget aurait fini mesuré sur un pire cas que le vérificateur ne contrôle plus. Rien n'est
 *  poussé dans la vraie maison : les états passent par `window.__injecter` (garde `?essai=1`,
 *  `demarrage.ts`), c'est-à-dire dans la page seulement.
 *
 *  QUEL CODE EST MESURÉ — et pourquoi l'outil échoue bruyamment. La page HTML, la session et le
 *  websocket sont ceux de Home Assistant ; SEUL le bundle est substitué, par interception de
 *  requête, avec le `dist/` du dépôt (`dist/wallpanel.js` + `.css`, versionnés, cf. décision 2).
 *  Sans cette substitution on mesurerait le bundle DÉPLOYÉ, qui ne porte pas `data-zone` : la
 *  mesure serait fausse, plausible, et publiée sous le nom d'un mode. L'interception est donc
 *  COMPTÉE, et un compteur nul fait sortir en code non nul avant toute mesure.
 *
 *  Usage :
 *    cd app && npm run build          # `dist/` doit porter le `data-zone` de `src/`
 *    NIVUUS_HA_DATA=<répertoire de données HA> node outils/mesurer-hauteurs.mjs [--json]
 *  Sortie : le détail par mode sur stderr, et sur stdout le bloc `hauteurs` à recopier dans
 *  `contrat/budget.json`.
 *
 *  Le jeton Home Assistant est lu dans `.mcp.json` et injecté dans le navigateur ; il n'est
 *  jamais affiché, ni sur stdout ni sur stderr. */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODES, JOUR_COURT, pageDuMode, poserMode, AFFICHES_PNG, lireIdentifiants, fabriquerJetons,
} from './verifier-rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(RACINE, 'dist');
const BUDGET = JSON.parse(readFileSync(join(RACINE, 'contrat', 'budget.json'), 'utf8'));
const { largeur: LARGEUR, hauteur: HAUTEUR } = BUDGET.viewportReference;

/** Codes de sortie, tous distincts : ce script est appelé à la main, mais une mesure fausse
 *  coûte plus cher qu'une mesure absente — chaque échec doit se lire sans ambiguïté. */
const SORTIE = { DIST: 3, INTERCEPTION: 4, INJECTEUR: 5, ZONES: 6, MODES: 7 };

function echouer(code, ...lignes) {
  console.error('');
  for (const l of lignes) console.error(`✗ ${l}`);
  process.exit(code);
}

// --- 1. Le bundle à servir : celui du dépôt, pas celui des tablettes -------------------------

const CHEMIN_JS = join(DIST, 'wallpanel.js');
const CHEMIN_CSS = join(DIST, 'wallpanel.css');
for (const f of [CHEMIN_JS, CHEMIN_CSS]) {
  if (!existsSync(f)) {
    echouer(SORTIE.DIST, `${f} est absent.`,
      'Lancer `cd app && npm run build` avant de mesurer : c\'est ce bundle qui est servi.');
  }
}
const BUNDLE = { js: readFileSync(CHEMIN_JS, 'utf8'), css: readFileSync(CHEMIN_CSS, 'utf8') };
// `dist/` est VERSIONNÉ et doit suivre `src/` à chaque commit (décision 2 du dépôt). S'il ne porte
// pas `data-zone`, il date d'avant cette tâche : le mesurer donnerait « aucune zone trouvée » et
// ferait chercher le défaut à l'endroit où il n'est pas.
if (!BUNDLE.js.includes('data-zone')) {
  echouer(SORTIE.DIST, 'dist/wallpanel.js ne contient AUCUN `data-zone`.',
    'Le bundle du dépôt est antérieur au marquage des zones — relancer `cd app && npm run build`.');
}

// --- 2. Session Home Assistant et interception ----------------------------------------------

const { url: HA_URL, token } = lireIdentifiants();
const jetons = fabriquerJetons(HA_URL, token);

const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
await ctx.addInitScript((j) => { localStorage.setItem('hassTokens', JSON.stringify(j)); }, jetons);

const servis = { js: 0, css: 0 };
await ctx.route('**/local/wallpanel/wallpanel.js*', (route) => {
  servis.js++;
  return route.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: BUNDLE.js,
  });
});
await ctx.route('**/local/wallpanel/wallpanel.css*', (route) => {
  servis.css++;
  return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: BUNDLE.css });
});
// Les affiches d'essai du mode média/cinéma (`MODES`) : servies en mémoire comme le fait déjà
// `verifier-rendu.mjs`, pour ne dépendre d'aucun fichier réellement déposé dans `config/www/`.
for (const [nom, png] of AFFICHES_PNG) {
  await ctx.route(`**/local/wallpanel/essai-affiche-${nom}.png`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }));
}

const page = await ctx.newPage();
const erreursPage = [];
page.on('pageerror', (e) => erreursPage.push(e.message));
// `setFixedTime` et non `install` : même raison que dans `verifier-rendu.mjs` — on fige `Date`
// pour que le bandeau (heure, date, pastille) ne dépende pas de l'heure de lancement, sans
// toucher à `requestAnimationFrame`.
await page.clock.setFixedTime(JOUR_COURT);

/** Ce que la page mesure d'elle-même, à chaque mode. Exécuté CÔTÉ NAVIGATEUR : aucune fermeture
 *  sur une variable Node. Les hauteurs sont arrondies au dixième de pixel — pas à l'unité : le
 *  mode le plus serré du projet (`menage`) n'a que quelques pixels de reste, et six zones
 *  arrondies à l'unité peuvent à elles seules déplacer un verdict de 3 px. */
function releverZones() {
  const app = document.getElementById('app');
  const corps = document.querySelector('#app .corps');
  if (!app || !corps) return { erreur: 'aucun #app .corps dans le DOM' };
  const d1 = (v) => Math.round(v * 10) / 10;
  const nombre = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  /* Le COÛT NET d'un enfant de la colonne : sa boîte plus ses marges. `.etiquette` porte
     `margin-bottom: -4px` (base.css) et `.xl` un `margin-top: auto` (qui vaut « tout le reste »,
     et ne doit donc jamais être compté comme un coût).
     `computedStyleMap()` et NON `getComputedStyle()` pour reconnaître ce `auto` : le second rend
     la valeur UTILISÉE, c'est-à-dire l'espace que le moteur a réellement distribué — un premier
     jet comparait `style.marginTop === 'auto'`, qui est faux en permanence, et publiait donc
     « Toute la maison » à 197,6 px au lieu de 62 (le reste du mode le plus creux, compté comme
     une hauteur de bouton). Le typed OM, lui, garde la valeur CALCULÉE : `auto` y reste `auto`. */
  const estAuto = (el, prop) => {
    try { return String(el.computedStyleMap().get(prop)) === 'auto'; } catch { return false; }
  };
  const cout = (el) => {
    const s = getComputedStyle(el);
    const mh = estAuto(el, 'margin-top') ? 0 : nombre(s.marginTop);
    const mb = estAuto(el, 'margin-bottom') ? 0 : nombre(s.marginBottom);
    return d1(el.getBoundingClientRect().height + mh + mb);
  };

  const zones = {};
  for (const el of document.querySelectorAll('[data-zone]')) {
    const nom = el.getAttribute('data-zone');
    // Une zone vue deux fois serait une ambiguïté, jamais une moyenne : on garde la plus haute
    // (le pire cas) et on dit combien d'exemplaires ont été trouvés.
    const c = cout(el);
    zones[nom] = zones[nom] === undefined ? { px: c, exemplaires: 1 }
      : { px: Math.max(zones[nom].px, c), exemplaires: zones[nom].exemplaires + 1 };
  }

  const sc = getComputedStyle(corps);
  const grille = document.querySelector('[data-zone="commandes"]');
  const sg = grille ? getComputedStyle(grille) : null;
  const colonnes = sg ? sg.gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  const tuiles = grille ? grille.children.length : 0;
  const commandes = grille ? {
    total: d1(grille.getBoundingClientRect().height),
    tuiles,
    colonnes,
    rangees: colonnes ? Math.ceil(tuiles / colonnes) : 0,
    hauteurTuile: grille.firstElementChild
      ? d1(grille.firstElementChild.getBoundingClientRect().height) : null,
    gouttiere: nombre(sg.rowGap),
  } : null;

  // Le reste RÉELLEMENT libre dans la colonne : l'espace qu'absorbe le `margin-top: auto` du
  // bouton « Toute la maison ». C'est la marge du mode, mesurée et non déduite — et le seul
  // contrôle qui puisse dire si le modèle arithmétique de `combien()` dit vrai.
  const enfants = [...corps.children];
  const xl = corps.querySelector('[data-zone="touteLaMaison"]');
  let reste = null;
  if (xl) {
    const i = enfants.indexOf(xl);
    const precedent = i > 0 ? enfants[i - 1] : null;
    reste = precedent
      ? d1(xl.getBoundingClientRect().top - precedent.getBoundingClientRect().bottom
           - nombre(sc.rowGap) - nombre(getComputedStyle(precedent).marginBottom))
      : null;
  }

  return {
    zones,
    commandes,
    corps: {
      hauteur: d1(corps.getBoundingClientRect().height),
      paddingHaut: nombre(sc.paddingTop),
      paddingBas: nombre(sc.paddingBottom),
      gouttiere: nombre(sc.rowGap),
      enfants: enfants.length,
      ordre: enfants.map((el) => el.getAttribute('data-zone') ?? `(${el.className})`),
    },
    app: d1(app.getBoundingClientRect().height),
    reste,
  };
}

// --- 3. Mesure, mode par mode ---------------------------------------------------------------

const familleDuBloc = (nom) => {
  if ((BUDGET.modesSansCommande ?? []).includes(nom)) return 'blocMinuteur';
  if ((BUDGET.modesABlocHaut ?? []).includes(nom)) return 'blocHaut';
  return 'blocDefaut';
};

const releves = [];
let code = 0;
try {
  await page.goto(`${HA_URL}/local/wallpanel/salon.html?essai=1`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(3500);

  if (!servis.js || !servis.css) {
    echouer(SORTIE.INTERCEPTION,
      `L'interception du bundle NE S'EST PAS DÉCLENCHÉE (js: ${servis.js}, css: ${servis.css}).`,
      'La page a donc chargé le bundle DÉPLOYÉ, qui ne porte pas `data-zone` : toute mesure',
      'publiée ici serait fausse. Vérifier le motif des routes contre les balises de la page',
      '(`/local/wallpanel/wallpanel.js?v=…`).');
  }
  if (!await page.evaluate(() => typeof window.__injecter === 'function')) {
    echouer(SORTIE.INJECTEUR, '`window.__injecter` est absent : le bundle servi n\'expose pas le',
      'point d\'injection (`?essai=1`, `demarrage.ts`). Aucun mode n\'est posable.');
  }
  const zonesVues = await page.evaluate(() => document.querySelectorAll('[data-zone]').length);
  if (zonesVues === 0) {
    echouer(SORTIE.ZONES, 'Aucun élément `[data-zone]` dans la page rendue,',
      'alors que le bundle servi en contient — la page ne rend pas l\'accueil attendu.');
  }
  console.error(`bundle servi depuis dist/ : ${servis.js} × js, ${servis.css} × css — `
    + `${zonesVues} zones marquées à l'écran`);
  console.error('');

  for (const mode of MODES) {
    await poserMode(page, HA_URL, mode);
    const atteint = await page.evaluate((s) => document.querySelector(s) !== null, mode.marqueur);
    if (!atteint) {
      console.error(`✗ ${mode.nom.padEnd(17)} NON ATTEINT (marqueur ${mode.marqueur} absent) — `
        + 'aucune hauteur publiée pour ce mode');
      code = SORTIE.MODES;
      continue;
    }
    const m = await page.evaluate(releverZones);
    if (m.erreur) {
      console.error(`✗ ${mode.nom.padEnd(17)} ${m.erreur}`);
      code = SORTIE.MODES;
      continue;
    }
    releves.push({ mode: mode.nom, piece: pageDuMode(mode), famille: familleDuBloc(mode.nom), ...m });
    const z = (n) => (m.zones[n] ? String(m.zones[n].px).padStart(6) : '     —');
    console.error(`· ${mode.nom.padEnd(17)} ${m.piece ?? pageDuMode(mode)}`.padEnd(30)
      + `bandeau${z('bandeau')}  bloc${z('blocCentral')}  synthèse${z('synthese')}`
      + `  ambiance${z('rangeeAmbiance')}  commandes${m.commandes ? String(m.commandes.total).padStart(6) : '     —'}`
      + `  reste ${m.reste}`);
  }
} finally {
  await nav.close();
}

if (releves.length === 0) {
  echouer(SORTIE.MODES, 'Aucun mode n\'a pu être mesuré — rien à publier.');
}

// --- 4. Le pire cas, zone par zone ----------------------------------------------------------

const maxZone = (nom, filtre = () => true) => {
  const vus = releves.filter(filtre).map((r) => r.zones[nom]?.px).filter((v) => v !== undefined);
  return vus.length ? Math.max(...vus) : null;
};
const maxBloc = (famille) => maxZone('blocCentral', (r) => r.famille === famille);

const grilles = releves.map((r) => r.commandes).filter(Boolean);
const constante = (nom, valeurs) => {
  const uniques = [...new Set(valeurs)];
  if (uniques.length > 1) {
    console.error(`! ${nom} n'est pas constant d'un mode à l'autre (${uniques.join(', ')}) — `
      + 'le maximum est publié');
  }
  return Math.max(...uniques);
};

const hauteurs = {
  // Les PIÈCES ne sont pas nommées ici, seulement comptées : ce fichier part chez toutes les
  // maisons (cf. `contrat/README.md`), et un nom de pièce y serait une donnée de celle-ci.
  _source: `app/outils/mesurer-hauteurs.mjs, viewport ${LARGEUR}x${HAUTEUR}, `
    + `mesure du ${new Date().toISOString().slice(0, 10)} sur ${releves.length} modes `
    + `et ${new Set(releves.map((r) => r.piece)).size} ecrans. Chaque valeur est le COUT NET `
    + 'de la zone dans la colonne .corps (boite + marges), au PIRE CAS des modes mesures.',
  gouttiere: constante('la gouttière de .corps', releves.map((r) => r.corps.gouttiere)),
  paddingCorps: constante('le padding vertical de .corps',
    releves.map((r) => r.corps.paddingHaut + r.corps.paddingBas)),
  bandeau: maxZone('bandeau'),
  etiquetteAmbiance: maxZone('etiquetteAmbiance'),
  rangeeAmbiance: maxZone('rangeeAmbiance'),
  rangeeCommandes: constante('la hauteur d\'une tuile de commande',
    grilles.map((g) => g.hauteurTuile)),
  gouttiereCommandes: constante('la gouttière de la grille .commandes',
    grilles.map((g) => g.gouttiere)),
  blocDefaut: maxBloc('blocDefaut'),
  blocHaut: maxBloc('blocHaut'),
  blocMinuteur: maxBloc('blocMinuteur'),
  synthese: maxZone('synthese'),
  touteLaMaison: maxZone('touteLaMaison'),
};

console.error('');
for (const [nom, v] of Object.entries(hauteurs)) {
  if (nom !== '_source') console.error(`  ${nom.padEnd(20)} ${v === null ? 'NON MESURÉ' : `${v} px`}`);
}
const manquantes = Object.entries(hauteurs).filter(([, v]) => v === null).map(([k]) => k);
if (manquantes.length) {
  console.error('');
  console.error(`! zones NON MESURÉES : ${manquantes.join(', ')} — le bloc ci-dessous est `
    + 'incomplet, ne pas le recopier tel quel');
  code = code || SORTIE.ZONES;
}

console.log(JSON.stringify(
  process.argv.includes('--json') ? { hauteurs, releves } : { hauteurs }, null, 2));
process.exit(code);
