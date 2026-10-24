/** The timer setting screen, the timer entry tile and the actions both call. The timers
 *  themselves are a stack card since 2026-10-24 (`cards/timer.ts`).
 *
 *  No decision here — neither which slot is free nor which service to call. This module calls
 *  actions wired by `boot/wiring.ts`, the only one holding the connection. */
import { html, nothing, type TemplateResult } from 'lit';
import {
  estDureeValide, PAS_FIN_MINUTEUR_S, PAS_MINUTEUR_S, type VueMinuteur,
} from '../minuteur';
import { icone } from './icones';

export type ActionsMinuteur = {
  ouvrir(): void;
  fermer(): void;
  changerDuree(deltaMinutes: number): void;
  choisirEtiquette(nom: string): void;
  start(): void;
  pause(slot: number): void;
  reprendre(slot: number): void;
  annuler(slot: number): void;
  ajuster(slot: number, deltaS: number): void;
};

const INERTE: ActionsMinuteur = {
  ouvrir() {}, fermer() {}, changerDuree() {}, choisirEtiquette() {}, start() {},
  pause() {}, reprendre() {}, annuler() {}, ajuster() {},
};

let actions: ActionsMinuteur = INERTE;
export function brancherMinuteur(a: ActionsMinuteur) { actions = a; }
/** The wired actions, read at press time: a card built before the wiring still acts on it. */
export const actionsMinuteur = (): ActionsMinuteur => actions;

/** Le libellé d'une ligne : son nom, ou son rang à défaut. Jamais une chaîne vide, qui laisserait
 *  une colonne inexplicablement blanche au mur.
 *
 *  Ronde de correction 1 (tâche 10 bis) : « N° 3 » et non « Minuteur 3 ». Le second, mesuré dans
 *  un vrai Chromium (tâche 10), déborde réellement de sa colonne (`.mn-nom`, `minmax(0, 1fr)` sur
 *  `.mn-ligne`) — ~86 px pour ~79 px disponibles — et s'ellipse en `« Minuteur… »`, perdant
 *  justement le numéro qui distingue ce minuteur des deux autres. `text-overflow: ellipsis` reste
 *  en place pour un NOM personnalisé anormalement long (jamais garanti court), mais le repli, lui,
 *  n'a aucune raison de risquer sa propre troncature : un identifiant plus court n'invente rien,
 *  il tient. */
export function libelle(v: VueMinuteur): string {
  return v.nom !== '' ? v.nom : `N° ${v.slot + 1}`;
}

// Task 7 (motion): `cle` stays optional. The ± 5 and ± 1 steps (SOLO form AND setting screen)
// each carry a mark; `marche`/`annuler` (row and solo alike) stay outside the table of task 7,
// hence without `data-mvt`. `cle` is the real SLOT (`solo()`) when there is one, otherwise a fixed
// literal (`rendreReglageMinuteur`, before any timer exists): a single setting screen at a time,
// so the fixed key is just as stable and unique there as a slot.
function bouton(
  action: string, contenu: unknown, surAppui: () => void, cle?: string,
): TemplateResult {
  return html`
    <div class="mn-bouton" data-action=${action}
         data-mvt=${cle ? `detail:mn-${action}-${cle}` : nothing}
         @pointerdown=${surAppui}>${contenu}</div>`;
}

/** The four steps of a duration, `− 5 / − 1 / + 1 / + 5`, shared by the SOLO form and the
 *  setting screen so that both screens step the same way. `pas` decides which steps are still
 *  meaningful at this value: a step that could only clamp, or cancel, is a dead button. */
function pas(
  cle: string, pasGros: number, pasFin: number, appliquer: (delta: number) => void,
  permis: (delta: number) => boolean,
): TemplateResult {
  const etapes: [string, string, number][] = [
    ['moins', '− 5', -pasGros], ['moins1', '− 1', -pasFin],
    ['plus1', '+ 1', pasFin], ['plus', '+ 5', pasGros],
  ];
  return html`
    <div class="mn-pas">
      ${etapes.map(([action, texte, delta]) => (permis(delta)
        ? bouton(action, texte, () => appliquer(delta), cle) : nothing))}
    </div>`;
}

/** The setting screen — task 10 bis (owner's decision, 2026-08-03): a FULL-SCREEN sub-view
 *  (`#minuteur`), exactly like `rendu/maison.ts`/`rendu/taches.ts`, rather than a state of the
 *  central block (measured at 718 px in task 10, 133 px beyond the 585 px budget). The automatic
 *  return after 45 s of inactivity is the generic one of the sub-views (`estSousVue`/
 *  `armerRetour`, `demarrage.ts`) — no token or timer of its own. A step is offered only if it
 *  lands WHOLE within the bounds: "− 5" at 3 min could only give back 1 min, which "− 1" already
 *  does honestly. */
export function rendreReglageMinuteur(
  dureeMinutes: number, etiquette: string | null, etiquettes: string[],
): TemplateResult {
  return html`
    <div class="minuteurs mn-reglage" data-mvt="vue:minuteur">
      <div class="mn-nom">Minuteur</div>
      <div class="mn-duree">${dureeMinutes} min</div>
      ${pas('reglage', PAS_MINUTEUR_S / 60, PAS_FIN_MINUTEUR_S / 60,
            (delta) => actions.changerDuree(delta), (delta) => estDureeValide(dureeMinutes + delta))}
      ${etiquettes.length ? html`
        <div class="mn-etiquettes" data-mvt="detail:mn-etiquettes">
          ${etiquettes.map((e) => html`
            <div class="mn-etiquette ${e === etiquette ? 'choisie' : ''}"
                 @pointerdown=${() => actions.choisirEtiquette(e)}>${e}</div>`)}
        </div>` : nothing}
      <div class="mn-nouveau" data-action="demarrer" data-mvt="detail:mn-nouveau"
           @pointerdown=${() => actions.start()}>
        ${icone('lecture')}Démarrer</div>
      <div class="xl" @pointerdown=${() => actions.fermer()}>${icone('home')}Retour</div>
    </div>`;
}

/** The timer entry tile: the 4th tile of the "Ambiance" row, or — when a card makes the
 *  arrangement drop that row (`rendu/corps.ts`) — the first place of the controls grid, drawn as
 *  a control (`dansGrille`). Saturated (three timers running), it does nothing and shows it: a
 *  setting whose `Démarrer` would have nowhere to go would be precisely the dead button this
 *  project hunts everywhere. */
export function tuileMinuteur(sature: boolean, dansGrille = false): TemplateResult {
  const ouvrir = () => { if (!sature) actions.ouvrir(); };
  return dansGrille
    // Saturated in the grid, it is an inert control (`.commande.inerte`, `base.css`): no feedback.
    ? html`<div class="commande tuile-minuteur ${sature ? 'inerte' : ''}" data-minuteur-entree
             data-mvt="tuile:minuteur" @pointerdown=${ouvrir}>
        ${icone('minuteur')}<div><div class="t">Minuteur</div></div></div>`
    : html`<div class="ambiance ${sature ? 'inactif' : ''}" data-minuteur-entree
             data-mvt="tuile:minuteur" @pointerdown=${ouvrir}>
        ${icone('minuteur')}<span>Minuteur</span></div>`;
}

/** Écrit un temps dans un nœud RENDU PAR LIT sans détruire son marqueur.
 *
 *  `el.textContent = …` efface le commentaire que `lit` place dans l'élément ; au rendu suivant,
 *  `lit` lève `TypeError: Cannot set properties of null` — et à CHAQUE redessin ensuite. C'est le
 *  défaut qui a figé les trois écrans dans la nuit du 2026-08-03 ; on mute donc le nœud texte
 *  existant plutôt que de le remplacer — le tic d'une seconde reste ainsi hors du moteur de
 *  mouvement, qui ne voit jamais ce nœud (the timer card's countdown carries no `data-mvt`,
 *  `cards/timer.ts`). */
export function writeTime(el: HTMLElement, texte: string): void {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) { (n as Text).data = texte; return; }
  }
}
