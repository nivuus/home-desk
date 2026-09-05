/** Vue « Tâches » (tâche 18) : deuxième et dernier niveau de profondeur de l'application, au même
 *  titre que « Toute la maison » (`rendu/maison.ts`) — même contrainte tactile du propriétaire
 *  (jamais de geste de navigation, tout par bouton), même patron (une seule vue, accessible
 *  depuis n'importe quelle pièce, retour automatique après inactivité câblé par `demarrage.ts`).
 *  Atteinte en touchant la ligne de synthèse de l'accueil (`.synthese`, cf. `rendu/corps.ts`), qui
 *  affiche déjà ces mêmes compteurs (« 4 tâches d'entretien »...) — le propriétaire touche ce
 *  qu'il vient de lire.
 *
 *  Cocher est destructif du point de vue de l'utilisateur (une tâche cochée par erreur disparaît
 *  de sa liste sans qu'il sache laquelle) : chaque ligne exige DEUX appuis — le premier arme une
 *  confirmation visuelle (« Toucher pour confirmer »), le second (dans la fenêtre, cf.
 *  `creerArmement` dans `cochage.ts`) coche réellement — jamais un appui long, contrainte non
 *  négociable du propriétaire sur ces dalles. */
import { html, type TemplateResult } from 'lit';
import { icone } from './icones';
import type { TacheAffichee } from '../cochage';

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
      <div class="etiquette ${horsLigne ? 'hl' : ''}">${horsLigne ? 'Hors ligne' : 'Tâches'}</div>
      <div class="taches-liste">
        ${vide ? html`<div class="taches-vide" data-mvt="detail:taches-vide">Aucune tâche</div>` : ''}
        ${visibles.map((t) => {
          const armee = estArmee(t.entite, t.uid);
          return html`
          <div class="ligne-tache ${armee ? 'armee' : ''}" data-mvt="ligne:${t.uid}"
               @pointerdown=${() => cocher(t.entite, t.uid)}>
            ${icone(armee ? 'coche' : 'case')}
            <div><div class="t">${t.texte}</div>
              <div class="s">${armee ? 'Toucher pour confirmer' : t.liste}</div></div>
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
            <div><div class="t">+${reste} tâche${reste > 1 ? 's' : ''}</div>
              <div class="s">Voir Home Assistant pour la suite</div></div>
          </div>` : ''}
      </div>
      <div class="xl" @pointerdown=${() => (location.hash = '')}>${icone('home')}Retour</div>
    </div>`;
}
