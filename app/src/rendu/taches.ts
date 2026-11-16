/** Vue « Tâches » (tâche 18) : deuxième et dernier niveau de profondeur de l'application, au même
 *  titre que « Toute la maison » (`rendu/maison.ts`) — même contrainte tactile du propriétaire
 *  (jamais de geste de navigation, tout par bouton), même patron (une seule vue, accessible
 *  depuis n'importe quelle pièce, retour automatique après inactivité câblé par `demarrage.ts`).
 *  Atteinte en touchant la ligne de synthèse de l'accueil (`.synthese`, cf. `rendu/corps.ts`), qui
 *  affiche déjà ces mêmes compteurs (« 4 tâches d'entretien »...) — le propriétaire touche ce
 *  qu'il vient de lire.
 *
 *  Checking off is destructive from the user's point of view (a task checked off by mistake
 *  disappears from their list without them knowing which one): each row demands TWO presses —
 *  the first arms a visual confirmation ("Toucher pour confirmer"), the second (within the
 *  window, see `createArming` in `cochage.ts`) really checks it off — never a long press, a
 *  non-negotiable constraint of the owner on these panels. */
import { html, type TemplateResult } from 'lit';
import { icone } from './icones';
import type { TacheAffichee } from '../cochage';
import { numberFormat, t } from '../i18n';

let cocher: (entite: string, uid: string) => void = () => {};
export function brancherCochageTaches(fn: typeof cocher) { cocher = fn; }

export function rendreTaches(
  visibles: TacheAffichee[], reste: number,
  estArmee: (entite: string, uid: string) => boolean,
  horsLigne = false,
): TemplateResult {
  const vide = visibles.length === 0 && reste === 0;
  return html`
    <div class="corps" data-mvt="vue:taches">
      <div class="etiquette ${horsLigne ? 'hl' : ''}">${horsLigne ? t().offline : t().tasks.title}</div>
      <div class="taches-liste">
        ${vide ? html`<div class="taches-vide" data-mvt="detail:taches-vide">${t().tasks.empty}</div>` : ''}
        ${visibles.map((tache) => {
          const armee = estArmee(tache.entite, tache.uid);
          return html`
          <div class="ligne-tache ${armee ? 'armee' : ''}" data-mvt="ligne:${tache.uid}"
               @pointerdown=${() => cocher(tache.entite, tache.uid)}>
            ${icone(armee ? 'coche' : 'case')}
            <div><div class="t">${tache.texte}</div>
              <div class="s">${armee ? t().tasks.touchToConfirm : tache.list}</div></div>
          </div>`;
        })}
        <!-- Contrairement à TOUTE_LA_MAISON (tableau fixe), une liste todo.* n'est pas bornée à la
             compilation : cette ligne remplace systématiquement la dernière tâche visible dès que
             tout ne tient pas dans le budget (cf. repartirTaches, cochage.ts) — jamais de
             débordement silencieux. Non interactive (aucun pointerdown, jamais dans le groupe
             active de base.css) : rien à cocher ici, une case qui répondait au contact mentirait
             sur ce qu'elle fait. -->
        ${reste > 0 ? html`
          <div class="ligne-tache reste" data-mvt="detail:taches-reste">${icone('list')}
            <div><div class="t">${t().tasks.more(reste, numberFormat().format(reste))}</div>
              <div class="s">${t().tasks.seeHomeAssistant}</div></div>
          </div>` : ''}
      </div>
      <div class="xl" @pointerdown=${() => (location.hash = '')}>${icone('home')}${t().back}</div>
    </div>`;
}
