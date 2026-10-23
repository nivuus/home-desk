#!/usr/bin/env node
/** Measures the media card and the synthèse line in a real Chromium, WITHOUT Home Assistant.
 *
 *  WHY A SECOND TOOL. `mesurer-hauteurs.mjs` measures the deployed page of a live Home Assistant:
 *  it needs that instance's long-lived token and serves the repository bundle in place of the
 *  deployed one. This tool needs neither. It bundles `src/` with esbuild (the same render
 *  functions, the same stylesheets as `src/index.ts`, read from that file and never listed again
 *  here), mounts the home view of each declared screen at the reference viewport, and reads the
 *  `data-zone` costs with the same rule as `mesurer-hauteurs.mjs`: box height plus margins.
 *
 *  WHAT IT POSES. The worst media card the redesign can draw (spec 2026-10-23): a remote source
 *  (label `EN COURS · <room>`), a title clamped on two lines, a subtitle, progress, the three
 *  transport discs, and the volume row — measured with a level gauge AND with step buttons, the
 *  taller one wins. Each screen is rendered in `media` mode through `rendreCorps` with a real
 *  `ContexteModes`, so the arrangement the budget chooses (`arrangement`, `screen-budget.ts`) is
 *  the one laid out, and `reste` (the space `margin-top: auto` of "Toute la maison" absorbs) says
 *  whether the screen actually fits. The header is a placeholder of `hauteurs.bandeau` px: its
 *  height is measured, invariant, by `mesurer-hauteurs.mjs`, and it never changes the width.
 *
 *  The synthèse is measured twice: as rendered (two-line worst case: four deviations) and with
 *  the `reduite` class, whatever the arrangement chose — the CSS rule is what is measured.
 *
 *  Usage:  cd app && node outils/mesurer-carte-media.mjs      (no build needed, `dist/` untouched)
 *  Output: per-screen detail on stderr, `{ blocMedia, syntheseReduite }` on stdout. */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = JSON.parse(readFileSync(join(APP, '..', 'contrat', 'budget.json'), 'utf8'));
const { largeur: LARGEUR, hauteur: HAUTEUR } = BUDGET.viewportReference;

// The stylesheets of the real page, taken from its entry point, never re-listed.
const feuilles = readFileSync(join(APP, 'src', 'index.ts'), 'utf8')
  .split('\n').filter((l) => /^import '\.\/styles\/[^']+\.css';$/.test(l)).join('\n');

const ENTREE = `${feuilles}
import { render, html } from 'lit';
import { Etat } from './etat';
import { ECRANS } from './ecran';
import { resoudreSource, CAP } from './media';
import { rendreCarteMedia } from './rendu/media';
import { rendreCorps } from './rendu/corps';
import { AGENCEMENT_DEFAUT } from './agencement';

const LECTEUR = 'media_player.mesure_carte';
window.__ecrans = Object.keys(ECRANS);
const DECL = { nom: 'Musique', piece: 'Chambre', titre: [LECTEUR], sousTitre: [LECTEUR],
  affiche: [LECTEUR], progression: [LECTEUR], transport: [LECTEUR], volume: [LECTEUR] };

window.__poser = (cle, parPas, bandeau) => {
  const piece = ECRANS[cle];
  const etat = new Etat();
  const ev = (id, state, attributes = {}) => etat.appliquer({ entity_id: id, state, attributes });
  const transport = CAP.PAUSE | CAP.PLAY | CAP.PRECEDENT | CAP.SUIVANT;
  ev(LECTEUR, 'playing', {
    media_title: 'Un titre de chanson assez long pour tenir sur deux lignes entieres de la carte',
    media_artist: 'Un artiste au nom lui aussi passablement long',
    media_position: 61, media_duration: 245,
    supported_features: transport | (parPas ? CAP.VOLUME_PAS : CAP.VOLUME_SET),
    ...(parPas ? {} : { volume_level: 0.5 }),
  });
  for (const b of [...piece.commandes, ...piece.ambiances]) ev(b.entite, 'off');
  // Worst synthèse: every declared entry deviating at once, so the clamp is engaged.
  for (const e of piece.synthese) {
    const v = e.valeur;
    ev(e.entite, String(e.operateur === '<' ? v - 1 : e.operateur === '>' ? v + 1
      : e.operateur === '==' ? v : typeof v === 'number' ? v + 3 : 'ecart'));
  }
  const source = resoudreSource(etat, DECL);
  const ctx = {
    alerte: false, aspirateurEnMarche: false, ecranAllume: false, sourceJoue: true,
    ouvrantOuvertDepuisMs: 0, chauffageEnMarche: false, ilPleut: false,
    serrureDeverrouillee: false, temperatureExterieure: 15, soleilLeve: true, modeInvites: false,
    minuteurEnCours: false, recetteEnCours: false,
    rangeeAmbiance: piece.ambiances.length > 0 || (piece.minuteurs?.length ?? 0) > 0,
    modes: AGENCEMENT_DEFAUT.modes, modulateurs: AGENCEMENT_DEFAUT.modulateurs,
    zones: AGENCEMENT_DEFAUT.zones, hauteurUtile: piece.hauteurUtile,
  };
  const carte = rendreCarteMedia(source, Date.now(), { status: 'pending' }, true);
  render(html\`<div class="ecran">
      <div style="height:\${bandeau}px;flex:none"></div>
      \${rendreCorps(etat, piece, carte, ctx)}
    </div>\`, document.getElementById('app'));
};
`;

const sortie = await build({
  stdin: { contents: ENTREE, resolveDir: join(APP, 'src'), loader: 'ts', sourcefile: 'mesure.ts' },
  bundle: true, write: false, format: 'iife', outdir: join(APP, '.mesure'), logLevel: 'error',
});
const js = sortie.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = sortie.outputFiles.find((f) => f.path.endsWith('.css')).text;

/** Runs IN THE PAGE: net cost of each zone, and the free space above "Toute la maison". */
function relever() {
  const d1 = (v) => Math.round(v * 10) / 10;
  const n = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  const auto = (el, p) => { try { return String(el.computedStyleMap().get(p)) === 'auto'; } catch { return false; } };
  const cout = (el) => {
    const s = getComputedStyle(el);
    return d1(el.getBoundingClientRect().height + (auto(el, 'margin-top') ? 0 : n(s.marginTop))
      + (auto(el, 'margin-bottom') ? 0 : n(s.marginBottom)));
  };
  const zones = {};
  for (const el of document.querySelectorAll('[data-zone]')) zones[el.dataset.zone] = cout(el);
  const corps = document.querySelector('.corps');
  const enfants = [...corps.children];
  const xl = corps.querySelector('[data-zone="touteLaMaison"]');
  const prec = enfants[enfants.indexOf(xl) - 1];
  const reste = d1(xl.getBoundingClientRect().top - prec.getBoundingClientRect().bottom
    - n(getComputedStyle(corps).rowGap));
  const synthese = document.querySelector('.synthese');
  const reduiteRendue = synthese.classList.contains('reduite');
  synthese.classList.add('reduite');
  const reduite = cout(synthese);
  if (!reduiteRendue) synthese.classList.remove('reduite');
  return {
    zones, reste, reduite, reduiteRendue,
    commandes: document.querySelectorAll('.commandes > *').length,
    ambiance: zones.rangeeAmbiance !== undefined,
    bas: d1(xl.getBoundingClientRect().bottom), app: d1(document.getElementById('app').getBoundingClientRect().height),
  };
}

const nav = await chromium.launch({ headless: true });
let blocMedia = 0;
let syntheseReduite = 0;
try {
  const page = await nav.newPage({ viewport: { width: LARGEUR, height: HAUTEUR } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <style>${css}</style>
    <!-- Measurement only: a column child too tall for the frame is SHRUNK by flex (and its
         overflow clipped), which would publish a squeezed height as the zone's cost. Unshrinkable
         here, so every zone keeps its natural height and an overflow shows as a negative reste. -->
    <style>.corps > * { flex-shrink: 0 !important; }</style></head><body><div id="app" class="m3"></div></body></html>`);
  await page.addScriptTag({ content: js });
  for (const cle of await page.evaluate(() => window.__ecrans)) {
    for (const parPas of [false, true]) {
      await page.evaluate(([c, p, b]) => window.__poser(c, p, b), [cle, parPas, BUDGET.hauteurs.bandeau]);
      await page.waitForTimeout(50);
      const m = await page.evaluate(relever);
      blocMedia = Math.max(blocMedia, m.zones.blocCentral);
      syntheseReduite = Math.max(syntheseReduite, m.reduite);
      console.error(`· ${cle.padEnd(8)} volume ${parPas ? 'par pas' : 'niveau '}  carte ${m.zones.blocCentral}`
        + `  synthese ${m.zones.synthese}${m.reduiteRendue ? ' (reduite)' : ''}  reduite ${m.reduite}`
        + `  ambiance ${m.ambiance ? 'oui' : 'non'}  commandes ${m.commandes}  reste ${m.reste}`
        + `  ${m.bas <= m.app ? 'tient' : `DEBORDE de ${Math.round((m.bas - m.app) * 10) / 10} px`}`);
    }
  }
  if (erreurs.length) throw new Error(`page errors: ${erreurs.join(' | ')}`);
} finally {
  await nav.close();
}
console.log(JSON.stringify({ blocMedia, syntheseReduite }, null, 2));
