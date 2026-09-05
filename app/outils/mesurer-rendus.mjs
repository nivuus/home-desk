#!/usr/bin/env node
/** Mesure ce que coûte la page wallpanel dans un vrai navigateur : messages websocket reçus,
 *  temps de script, recalculs de style/mise en page, tas JS. Ne déploie rien : par défaut le
 *  bundle DÉPLOYÉ est mesuré (celui des tablettes). Usage :
 *    node mesurer-rendus.mjs <piece> <secondes>                                            */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

/* `NIVUUS_HA_DATA` : le repertoire de donnees de l'instance Home Assistant a
 * mesurer — celui qui porte `.mcp.json`, d'ou ce script tire l'URL et le jeton.
 * Il etait CODE EN DUR jusqu'au 2026-09-05, ce qui figeait cet outil sur une
 * seule machine et laissait un chemin de production dans du code suivi par git.
 * Exemple : NIVUUS_HA_DATA=<repertoire de donnees HA> node outils/mesurer-rendus.mjs <piece> <secondes>
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
const piece = process.argv[2] ?? 'salon';
const duree = Number(process.argv[3] ?? 120);
const mcp = JSON.parse(readFileSync(`${DATA}/.mcp.json`, 'utf8')).mcpServers.homeassistant.env;
const HA_URL = mcp.HA_URL.replace(/\/$/, '');
const jetons = {
  access_token: mcp.HA_TOKEN,
  refresh_token: 'mesure-sans-rafraichissement',
  expires: Date.now() + 31536000000,
  clientId: `${HA_URL}/`,
};

const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: 343, height: 585 } });
await ctx.addInitScript((j) => {
  localStorage.setItem('hassTokens', JSON.stringify(j));
  // Compteurs posés AVANT tout script de la page : un WebSocket enveloppé compte les messages
  // réellement reçus, sans rien changer au comportement.
  const Vrai = window.WebSocket;
  window.__compteurs = { ws: 0, octets: 0, mutations: 0 };
  window.WebSocket = function (...a) {
    const s = new Vrai(...a);
    s.addEventListener('message', (e) => {
      window.__compteurs.ws++;
      window.__compteurs.octets += (e.data?.length ?? 0);
    });
    return s;
  };
  window.WebSocket.prototype = Vrai.prototype;
  addEventListener('DOMContentLoaded', () => {
    const cible = document.getElementById('app') ?? document.body;
    new MutationObserver((ms) => { window.__compteurs.mutations += ms.length; })
      .observe(cible, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}, jetons);

const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await page.goto(`${HA_URL}/local/wallpanel/${piece}.html`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(8000);            // laisse passer la salve get_states

const lire = async () => Object.fromEntries(
  (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const depart = await lire();
const c0 = await page.evaluate(() => ({ ...window.__compteurs }));
const t0 = Date.now();
// Échantillonnage : distingue une croissance bornée (l'écran se remplit) d'une fuite (pente
// constante). Un seul relevé avant/après ne sait pas faire la différence.
for (let i = 0; i < Math.round(duree / 30); i++) {
  await page.waitForTimeout(30000);
  const m = await lire();
  const c = await page.evaluate(() => ({ ...window.__compteurs }));
  console.log(`t+${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  nœuds=${String(m.Nodes).padStart(6)}  tas=${(m.JSHeapUsedSize / 1048576).toFixed(1)}Mo  ws=${c.ws}  écouteurs=${m.JSEventListeners}`);
}
const fin = await lire();
const c1 = await page.evaluate(() => ({ ...window.__compteurs }));
const s = (Date.now() - t0) / 1000;

const d = (k) => fin[k] - depart[k];
console.log(`\n=== ${piece} — ${s.toFixed(0)} s de régime établi (hors salve de démarrage) ===`);
console.log(`messages websocket   : ${c1.ws - c0.ws}  (${((c1.ws - c0.ws) / s).toFixed(1)}/s, ${(((c1.octets - c0.octets) / s) / 1024).toFixed(1)} Ko/s)`);
console.log(`mutations DOM        : ${c1.mutations - c0.mutations}  (${((c1.mutations - c0.mutations) / s).toFixed(1)}/s)`);
console.log(`temps de script      : ${d('ScriptDuration').toFixed(2)} s  → ${(100 * d('ScriptDuration') / s).toFixed(1)} % d'un cœur`);
console.log(`temps de tâche total : ${d('TaskDuration').toFixed(2)} s  → ${(100 * d('TaskDuration') / s).toFixed(1)} % d'un cœur`);
console.log(`recalculs de style   : ${d('RecalcStyleCount')}  (${(d('RecalcStyleCount') / s).toFixed(1)}/s)`);
console.log(`mises en page        : ${d('LayoutCount')}  (${(d('LayoutCount') / s).toFixed(1)}/s)`);
console.log(`tas JS               : ${(depart.JSHeapUsedSize / 1048576).toFixed(1)} Mo → ${(fin.JSHeapUsedSize / 1048576).toFixed(1)} Mo`);
console.log(`nœuds DOM            : ${depart.Nodes} → ${fin.Nodes}`);
console.log(`écouteurs            : ${depart.JSEventListeners} → ${fin.JSEventListeners}`);
await nav.close();
