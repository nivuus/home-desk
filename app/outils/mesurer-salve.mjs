#!/usr/bin/env node
/** Mesure le coût des premières secondes : à chaque connexion websocket, Home Assistant
 *  republie TOUS les états (`get_states`). Ce script relève le travail fait entre le
 *  chargement et la fin de cette salve. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
/* `NIVUUS_HA_DATA` : le repertoire de donnees de l'instance Home Assistant a
 * mesurer — celui qui porte `.mcp.json`, d'ou ce script tire l'URL et le jeton.
 * Il etait CODE EN DUR jusqu'au 2026-09-05, ce qui figeait cet outil sur une
 * seule machine et laissait un chemin de production dans du code suivi par git.
 * Exemple : NIVUUS_HA_DATA=<repertoire de donnees HA> node outils/mesurer-salve.mjs <piece>
 */
function racineDonnees() {
  const d = process.env.NIVUUS_HA_DATA;
  if (!d) {
    console.error('NIVUUS_HA_DATA n\'est pas defini : indiquez le repertoire '
      + 'de donnees de Home Assistant (celui qui contient .mcp.json).');
    process.exit(2);
  }
  return d.replace(/\/$/, '');
}
const DATA = racineDonnees();
const mcp = JSON.parse(readFileSync(`${DATA}/.mcp.json`, 'utf8')).mcpServers.homeassistant.env;
const HA_URL = mcp.HA_URL.replace(/\/$/, '');
const piece = process.argv[2] ?? 'salon';
const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: 343, height: 585 } });
await ctx.addInitScript((t) => {
  localStorage.setItem('hassTokens', JSON.stringify({
    access_token: t, refresh_token: 'mesure', expires: Date.now() + 31536000000, clientId: 'x' }));
  const Vrai = window.WebSocket;
  window.__c = { ws: 0 };
  window.WebSocket = function (...a) {
    const s = new Vrai(...a);
    s.addEventListener('message', () => { window.__c.ws++; });
    return s;
  };
  window.WebSocket.prototype = Vrai.prototype;
}, mcp.HA_TOKEN);
// `--src` : sert le bundle construit à l'instant depuis `src/` à la place du déployé, par
// interception. Rien n'est écrit dans `config/www/wallpanel/`.
if (process.argv.includes('--src')) {
  // Même configuration que `bundlerApplication()` dans `verifier-rendu.mjs` : `outdir` en
  // mémoire, sinon esbuild refuse les imports CSS de `index.ts`.
  const r = await build({
    entryPoints: ['src/index.ts'], bundle: true, format: 'iife', write: false,
    target: 'es2020', outdir: '/mesure-en-memoire', logLevel: 'silent',
  });
  const js = r.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = r.outputFiles.find((f) => f.path.endsWith('.css')).text;
  await ctx.route('**/local/wallpanel/wallpanel.js*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: js }));
  await ctx.route('**/local/wallpanel/wallpanel.css*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: css }));
  console.log('bundle mesuré : construit depuis src/ (rien n\'est déployé)');
} else {
  console.log('bundle mesuré : celui DÉPLOYÉ sur les tablettes');
}

const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const lire = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const t0 = Date.now();
await page.goto(`${HA_URL}/local/wallpanel/${piece}.html`, { waitUntil: 'load', timeout: 30000 });
const a = await lire();
for (const t of [1, 2, 3, 5, 8, 12]) {
  while (Date.now() - t0 < t * 1000) await page.waitForTimeout(100);
  const m = await lire(); const c = await page.evaluate(() => window.__c.ws);
  console.log(`t+${String(t).padStart(2)}s  ws=${String(c).padStart(5)}  script=${(m.ScriptDuration - a.ScriptDuration).toFixed(2)}s  tâches=${(m.TaskDuration - a.TaskDuration).toFixed(2)}s  styles=${m.RecalcStyleCount - a.RecalcStyleCount}  layouts=${m.LayoutCount - a.LayoutCount}  nœuds=${m.Nodes}`);
}
await nav.close();
