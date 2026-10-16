/** The `#aspirer` sub-view: rooms as chips, then passes, then "Lancer". Same chips and same big
 *  buttons as the timer setting (`rendu/minuteur.ts`) — 62 px targets and the same touch layer
 *  (`base.css`), so the two choosing screens of the wall feel alike.
 *
 *  policy: allow-fr-file — this module is the tablet's user-facing French copy for this view,
 *  like `rendu/repli.ts`: its sentences are what the household reads on the wall. */
import { html, nothing, type TemplateResult } from 'lit';
import { icone } from './icones';
import { passRange, singlePassReason, type VacuumState } from '../boot/vacuum';

export type VacuumActions = {
  toggle(entite: string, zone: string): void;
  passes(n: number): void;
  launch(): void;
  retry(): void;
  close(): void;
};

let act: VacuumActions = {
  toggle: () => {}, passes: () => {}, launch: () => {}, retry: () => {}, close: () => {},
};
export function wireVacuum(actions: VacuumActions): void { act = actions; }

function rooms(v: VacuumState): TemplateResult {
  const titled = v.robots.length > 1;
  return html`${v.robots.map((r) => html`
    ${titled ? html`<div class="asp-titre">${r.nom}</div>` : nothing}
    <div class="mn-etiquettes" data-mvt="detail:asp-${r.entite}">
      ${r.pieces.map((p) => {
        const rang = v.chosen.findIndex((c) => c.entite === r.entite && c.zone === p.zone);
        return html`
          <div class="mn-etiquette ${rang >= 0 ? 'choisie' : ''}" data-zone-ha=${p.zone}
               @pointerdown=${() => act.toggle(r.entite, p.zone)}>${p.nom}${
                 v.chosen.length > 1 && rang >= 0 ? html`<span class="asp-rang">${rang + 1}</span>` : nothing}</div>`;
      })}
    </div>`)}`;
}

function passes(v: VacuumState): TemplateResult | typeof nothing {
  const { min, max } = passRange(v);
  if (max > min) {
    const choix = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return html`
      <div class="asp-titre">Passages</div>
      <div class="mn-etiquettes" data-mvt="detail:asp-passages">
        ${choix.map((n) => html`
          <div class="mn-etiquette ${n === v.passes ? 'choisie' : ''}" data-passages=${n}
               @pointerdown=${() => act.passes(n)}>${n}</div>`)}
      </div>`;
  }
  // Held to one pass for a reason: said, never a selector that silently disappeared.
  return singlePassReason(v) !== undefined
    ? html`<div class="asp-info">Un seul passage : le robot n’a pas donné ses limites.</div>`
    : nothing;
}

function body(v: VacuumState, horsLigne: boolean): TemplateResult {
  if (v.status === 'loading') return html`<div class="asp-info">Lecture des pièces…</div>`;
  if (v.status === 'failed' && !v.robots.length) {
    return html`
      <div class="asp-info">${v.message}</div>
      <div class="mn-nouveau" @pointerdown=${() => act.retry()}>Réessayer</div>`;
  }
  if (!v.robots.length) {
    return html`<div class="asp-info">Aucune pièce n’est associée à un aspirateur dans Home
      Assistant (réglages de l’aspirateur, « associer les segments aux pièces »).</div>`;
  }
  const pret = v.chosen.length > 0 && !horsLigne && v.status !== 'sending';
  return html`
    ${rooms(v)}
    ${passes(v)}
    ${v.message ? html`<div class="asp-info asp-erreur">${v.message}</div>` : nothing}
    ${horsLigne ? html`<div class="asp-info asp-erreur">Hors ligne</div>` : nothing}
    <div class="mn-nouveau ${pret ? '' : 'inactif'}" data-action="lancer" data-mvt="detail:asp-lancer"
         @pointerdown=${() => { if (pret) act.launch(); }}>
      ${icone('aspirateur')}${v.status === 'sending' ? 'Envoi…' : 'Lancer'}</div>`;
}

export function renderVacuumChoice(v: VacuumState, horsLigne: boolean): TemplateResult {
  return html`
    <div class="corps asp-choix" data-mvt="vue:aspirer">
      <div class="mn-nom">Aspirer</div>
      ${body(v, horsLigne)}
      <div class="xl" @pointerdown=${() => act.close()}>${icone('home')}Retour</div>
    </div>`;
}
