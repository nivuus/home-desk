/** Le bloc central du salon : ce que fait la voiture, et le seul geste qu'on lui demande depuis un
 *  mur — lancer ou arrêter la clim.
 *
 *  Il remplace les six prochaines heures (demande du propriétaire, 2026-08-03). Aucune décision
 *  ici : le rendu lit l'état et appelle une action branchée par `demarrage.ts`, comme
 *  `rendu/minuteur.ts` et `rendu/modes.ts`.
 *
 *  `enVol` est le retour optimiste. Il existe parce que cette voiture répond avec une à trois
 *  minutes de retard (cloud Stellantis) : sans lui, le bouton paraît mort et on rappuie trois
 *  fois — ce qui, sur un préconditionnement, enchaîne des commandes contradictoires. */
import { html, nothing, type TemplateResult } from 'lit';
import type { Etat } from '../etat';
import type { Voiture } from '../pieces';
import { icone } from './icones';

export type EnVolClim = 'demarrage' | 'arret' | null;

let actions = { clim(_demarrer: boolean) {} };
export function brancherVoiture(a: typeof actions) { actions = a; }

/** Un nombre publié par la voiture, ou `null`. Jamais une valeur inventée : une donnée absente
 *  disparaît de l'écran plutôt que de s'afficher à zéro — un « 0 % » faux sur une voiture
 *  électrique se lit comme une panne. */
function nombre(etat: Etat, id: string): number | null {
  if (!etat.estUtilisable(id)) return null;
  const n = Number(etat.lire(id)!.etat);
  return Number.isFinite(n) ? n : null;
}

function actif(etat: Etat, id: string): boolean {
  return etat.estUtilisable(id) && etat.lire(id)!.etat === 'on';
}

/** L'état, du plus parlant au moins parlant. La clim prime sur la charge, qui prime sur le simple
 *  branchement : c'est l'ordre de ce qu'on a besoin de savoir en passant devant l'écran.
 *
 *  Une voiture entièrement injoignable (les trois entités `unavailable`/absentes) retombe sur
 *  « Débranchée » : `actif` renvoie faux partout puisque `estUtilisable` refuse de trancher sans
 *  donnée, exactement le même choix que `libelleEtat` d'`alertes.ts` pour un capteur muet — ne
 *  jamais prétendre à un état qu'on ne connaît pas, mais ne jamais bloquer le bloc pour autant. */
function libelleEtat(etat: Etat, v: Voiture): string {
  if (actif(etat, v.clim)) return 'Clim en marche';
  if (actif(etat, v.enCharge)) return 'En charge';
  if (actif(etat, v.branchee)) return 'Branchée';
  return 'Débranchée';
}

export function rendreVoiture(etat: Etat, v: Voiture, enVol: EnVolClim): TemplateResult {
  const niveau = nombre(etat, v.batterie);
  const autonomie = nombre(etat, v.autonomie);
  const marche = actif(etat, v.clim);
  const libelleBouton = enVol === 'demarrage' ? 'Démarrage…'
    : enVol === 'arret' ? 'Arrêt…'
    : marche ? 'Arrêter la clim' : 'Lancer la clim';
  return html`
    <div class="voiture" data-mvt="bloc:voiture">
      <div class="vt-chiffres">
        ${niveau !== null
          ? html`<span class="vt-niveau" data-mvt="detail:vt-niveau">${Math.round(niveau)} %</span>`
          : nothing}
        ${autonomie !== null
          ? html`<span class="vt-autonomie" data-mvt="detail:vt-autonomie"
                 >${Math.round(autonomie)} km</span>`
          : nothing}
      </div>
      <div class="vt-etat">${libelleEtat(etat, v)}</div>
      <!-- Un appui pendant qu'un ordre est en vol ne fait rien : la voiture met jusqu'à trois
           minutes à confirmer, et deux ordres contradictoires coup sur coup finissent en échec
           côté Stellantis. Le bouton reste toujours affiché, même sans aucune donnée de batterie
           (voiture injoignable) : lancer la clim ne dépend d'aucun capteur, seulement des deux
           boutons button.*, qui restent appelables à tout moment. -->
      <div class="vt-bouton ${enVol !== null ? 'vt-attente' : ''}"
           @pointerdown=${() => { if (enVol === null) actions.clim(!marche); }}>
        ${icone('clim')}${libelleBouton}</div>
    </div>`;
}
