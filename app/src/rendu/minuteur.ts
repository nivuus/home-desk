/** Le bloc central des minuteurs : liste, forme solo, écran de réglage, tuile d'entrée.
 *
 *  Aucune décision ici — ni quel slot est libre, ni quel service appeler. Ce module reçoit des
 *  `VueMinuteur` déjà triées (`minuteur.ts`) et appelle des actions branchées par `demarrage.ts`,
 *  seul à détenir la connexion. Même patron que `rendu/modes.ts` et `rendu/media.ts`. */
import { html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  estDureeValide, formaterRestant, PAS_FIN_MINUTEUR_S, PAS_MINUTEUR_S, type VueMinuteur,
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
function libelle(v: VueMinuteur): string {
  return v.nom !== '' ? v.nom : `N° ${v.slot + 1}`;
}

/** Le temps d'une ligne. `data-minuteur` porte le slot : c'est par lui que le tic d'une seconde
 *  (`demarrage.ts`) retrouve le nœud à faire descendre. JAMAIS `data-mvt="chiffre:…"` : le rôle
 *  `chiffre` du moteur de mouvement (`src/mouvement/moteur.ts`) ferait rouler un chiffre à CHAQUE
 *  seconde, ce qui n'a aucun sens pour un décompte et se battrait avec le tic. */
function temps(v: VueMinuteur): TemplateResult {
  return html`<span class="mn-temps" data-minuteur=${v.slot}>${formaterRestant(v.restantS)}</span>`;
}

// Tâche 7 (mouvement) : `cle` reste optionnel. Les pas ± 5 et ± 1 (forme SOLO ET réglage) portent
// chacun une marque ; `marche`/`annuler` (ligne comme solo) restent hors de la table de la
// tâche 7, donc sans `data-mvt`. `cle` est le SLOT réel (`solo()`) quand il existe, sinon un
// littéral fixe (`rendreReglageMinuteur`, avant qu'aucun minuteur n'existe) : un seul écran de
// réglage possible à la fois, la clé fixe y est donc tout aussi stable/unique qu'un slot.
function bouton(
  action: string, contenu: unknown, surAppui: () => void, cle?: string,
): TemplateResult {
  return html`
    <div class="mn-bouton" data-action=${action}
         data-mvt=${cle ? `detail:mn-${action}-${cle}` : nothing}
         @pointerdown=${surAppui}>${contenu}</div>`;
}

function marche(v: VueMinuteur): TemplateResult {
  return v.actif
    ? bouton('marche', icone('pause'), () => actions.pause(v.slot))
    : bouton('marche', icone('lecture'), () => actions.reprendre(v.slot));
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

/** Forme SOLO : un seul minuteur en cours, donc la place d'un gros temps et du réglage fin.
 *
 *  Les pas n'existent QUE sur un minuteur en marche (tâche 1, découverte à l'exécution) :
 *  l'ajustement passe par un `timer.start` avec une durée recalculée (cf. `boot/controls.ts`),
 *  qui relancerait un minuteur mis en pause. Et un pas en moins disparaît dès qu'il ne reste
 *  plus de quoi le retirer en entier : il ne pourrait qu'annuler le minuteur, ce que fait déjà
 *  la croix à côté. Les pas (`.mn-pas`) et les commandes (`.mn-actions`) tiennent sur deux
 *  rangées : six cibles de 62 px ne rentrent pas dans une colonne de 311 px. */
// Tâche 7 (mouvement) — les pas ci-dessous sont marqués par SLOT, jamais par index de
// tableau : solo() ne reçoit qu'un seul VueMinuteur (vues.length === 1, cf. rendreMinuteurs), donc
// unique dans l'écran trivialement — mais le slot les rend en plus STABLES dans le temps pour le
// même minuteur physique, la même donnée que celle qui identifie déjà la ligne équivalente de la
// forme liste (data-minuteur de temps()).
function solo(v: VueMinuteur): TemplateResult {
  return html`
    <div class="minuteurs mn-solo" data-zone="blocCentral" data-mvt="bloc:minuteur-solo">
      <div class="mn-nom">${libelle(v)}</div>
      <div class="mn-grand">${temps(v)}</div>
      ${v.actif
        ? pas(String(v.slot), PAS_MINUTEUR_S, PAS_FIN_MINUTEUR_S,
              (delta) => actions.ajuster(v.slot, delta), (delta) => v.restantS > -delta)
        : nothing}
      <div class="mn-actions">
        ${marche(v)}
        ${bouton('annuler', icone('croix'), () => actions.annuler(v.slot))}
      </div>
    </div>`;
}

/** L'écran de réglage — tâche 10 bis (arbitrage du propriétaire, 2026-08-03) : une sous-vue
 *  PLEIN ÉCRAN (`#minuteur`), exactement comme `rendu/maison.ts`/`rendu/taches.ts`, plutôt qu'un
 *  état du bloc central (mesuré à 718 px en tâche 10, 133 px au-delà du budget de 585 px). Le
 *  retour automatique après 45 s d'inactivité est désormais celui, générique, des sous-vues
 *  (`estSousVue`/`armerRetour`, `demarrage.ts`) — plus de jeton ni de minuteur propres à cet
 *  écran. Un pas n'est offert que s'il tombe EN ENTIER dans les bornes : « − 5 » à 3 min ne
 *  pourrait que redonner 1 min, ce que « − 1 » fait déjà honnêtement. */
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

function ligne(v: VueMinuteur): TemplateResult {
  return html`
    <div class="mn-ligne ${v.actif ? '' : 'mn-pause'}">
      <div class="mn-nom">${libelle(v)}</div>
      ${temps(v)}
      ${marche(v)}
      ${bouton('annuler', icone('croix'), () => actions.annuler(v.slot))}
    </div>`;
}

export function rendreMinuteurs(vues: VueMinuteur[], slotLibre: boolean): TemplateResult {
  if (vues.length === 1) return solo(vues[0]);
  return html`
    <div class="minuteurs" data-zone="blocCentral" data-mvt="bloc:minuteurs">
      <!-- Clé par SLOT : une ligne qui change de rang doit être déplacée par lit, pas réécrite —
           sans quoi le tic d'une seconde écrirait dans le nœud d'un autre minuteur pendant une
           trame. Même raison que le repeat par entité de rendu/corps.ts. -->
      ${repeat(vues, (v) => v.slot, (v) => ligne(v))}
      ${slotLibre
        ? html`<div class="mn-nouveau" data-action="nouveau" data-mvt="detail:mn-nouveau"
                     @pointerdown=${() => actions.ouvrir()}>${icone('plus')}Nouveau</div>`
        : nothing}
    </div>`;
}

/** La 4e tuile de la rangée « Ambiance ». Saturée (trois minuteurs en cours), elle ne fait rien et
 *  le montre : la liste est déjà à l'écran, et un réglage dont `Démarrer` n'aurait nulle part où
 *  aller serait précisément le bouton mort que ce projet traque partout. */
export function tuileMinuteur(sature: boolean): TemplateResult {
  return html`
    <div class="ambiance ${sature ? 'inactif' : ''}" data-minuteur-entree data-mvt="tuile:minuteur"
         @pointerdown=${() => { if (!sature) actions.ouvrir(); }}>
      ${icone('minuteur')}<span>Minuteur</span></div>`;
}

/** Écrit un temps dans un nœud RENDU PAR LIT sans détruire son marqueur.
 *
 *  `el.textContent = …` efface le commentaire que `lit` place dans l'élément ; au rendu suivant,
 *  `lit` lève `TypeError: Cannot set properties of null` — et à CHAQUE redessin ensuite. C'est le
 *  défaut qui a figé les trois écrans dans la nuit du 2026-08-03 ; on mute donc le nœud texte
 *  existant plutôt que de le remplacer — le tic d'une seconde reste ainsi hors du moteur de
 *  mouvement (cf. `temps()` ci-dessus), qui ne voit jamais ce nœud. */
export function writeTime(el: HTMLElement, texte: string): void {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) { (n as Text).data = texte; return; }
  }
}
