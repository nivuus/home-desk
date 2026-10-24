/** What every pantry view shares: its input (`PantryView`), its frame — the same as the "Tâches"
 *  view: `.corps`, a label, the content, a Back button — and the short date format. */
import { html, type TemplateResult } from 'lit';
import { icone } from './icones';
import { pantryActions as act } from './pantry-actions';
import type { PantryState, Reason } from '../boot/pantry';

export type PantryView = {
  state: PantryState;
  horsLigne: boolean;
  /** Today's date, `YYYY-MM-DD`, in the tablet's time zone: a best-before date before it is
   *  past. */
  today: string;
  armed: (reason: Reason) => boolean;
};

/** The label line carries, by priority: the offline signal, the banner of the last consumption,
 *  then `label`. It costs no height: it replaces the text of a line that is always there. */
export function pantryFrame(v: PantryView, label: string, body: TemplateResult): TemplateResult {
  const texte = v.horsLigne ? 'Hors ligne' : v.state.banner ?? label;
  return html`
    <div class="corps garde-manger" data-mvt="vue:garde-manger">
      <div class="etiquette ${v.horsLigne ? 'hl' : ''}">${texte}</div>
      ${body}
      <div class="xl" @pointerdown=${() => act.back()}>${icone('home')}Retour</div>
    </div>`;
}

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "20 sept." — from the ISO date alone, in UTC, so that no time zone can shift the day. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DATE.format(new Date(Date.UTC(y, m - 1, d)));
}
