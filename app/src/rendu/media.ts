/** The media card: the only photographic element of the whole application (rule 2 of the
 *  coherence spec — one image on screen, never two, which is what makes it a focal point).
 *
 *  Layout (spec 2026-10-23, "Disposition (piste C)"), top to bottom: label `EN COURS · <room>`,
 *  title (two lines at most), subtitle; an 8 px progress bar with elapsed and remaining times;
 *  the transport row (previous, play/pause as the primary disc, next); the volume row (`−`,
 *  level, `+`). A row without data is not rendered: the card shrinks, it never shows an empty
 *  box. Every button is a 62 px solid disc.
 *
 *  Colours (spec, "Couleurs"): with a readable poster (`ToneState` ready), the poster covers the
 *  whole card untouched — no veil, no reduced opacity, no gradient — and the tones derived from
 *  it (`tones.ts`) colour the text, the discs and the bars. Pending, unreadable or no poster:
 *  theme colours, same layout, same solid discs. */
import { html, type TemplateResult } from 'lit';
import type { SourceResolue } from '../media';
import { sourceKey } from '../media-choice';
import { ancrerProgression, fractionAncree, secondesAncrees, type Ancre } from '../progression';
import type { ToneState } from './poster-sampler';
import { icone } from './icones';
import { writeTime } from './minuteur';
import { volumeRow } from './media-volume';

/** Filled once by `wireScreen` (`boot/wiring.ts`), same mechanism as `brancherAppui`. */
let agir: (domaine: string, service: string, entite: string, donnees?: Record<string, unknown>) => void =
  () => {};
/** Pins a remote source (by `sourceKey`) so that pausing it from here keeps the card on screen
 *  (`pickSource`, `media-choice.ts`). */
let epingler: (key: string) => void = () => {};
/** Repaints the screen (`dessiner`): the volume row shows a pressed level through a render,
 *  never by writing outside lit (`rendu/media-volume.ts`). */
let repeindre: () => void = () => {};
export function brancherMedia(fn: typeof agir, pin: (key: string) => void, repaint: () => void = () => {}) {
  agir = fn;
  epingler = pin;
  repeindre = repaint;
}

/** Hardens a poster URL before it lands in `style="background-image:url('…')"`: `lit` escapes
 *  nothing inside an attribute, and the URL is not ours (a third-party integration, a file
 *  name). Only what can leave `url('…')` is percent-encoded — both quotes, the parentheses, the
 *  backslash (the CSS escape) and any white space. `encodeURI` was tried and REJECTED: it encodes
 *  `%` into `%25` and breaks every already percent-encoded URL (`Mon%20affiche.png`). The server
 *  reads the percent-encoding back as the original character, so the poster still loads. */
export function urlSure(u: string): string {
  return String(u).replace(/['"()\\]|\s/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/** `m:ss`, or `h:mm:ss` from one hour on — whole seconds, rounded down like any player. */
export function formatMediaTime(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The remaining time carries a true minus sign (U+2212), as in the approved mockup. */
const remaining = (a: Ancre, elapsed: number): string =>
  `−${formatMediaTime(a.duree - Math.floor(elapsed))}`;

/** The per-second tick (`tictacProgression`, `boot/timers.ts`): rewrites the elapsed and
 *  remaining times and, when `moveRail`, the bar — from the SAME anchor at the SAME instant, so
 *  the text and the bar never disagree. The one exception is `?mouvement=aucun` (`moveRail`
 *  false): the times keep moving and the bar waits for the next `dessiner()`. No `lit` render: the times are written into their
 *  existing text nodes (`writeTime`) and the bar through `--progression`; the next `dessiner()`
 *  rewrites the exact values anyway. */
export function writeProgress(card: HTMLElement, a: Ancre, horlogeMs: number, moveRail: boolean): void {
  const elapsed = secondesAncrees(a, horlogeMs);
  const e = card.querySelector<HTMLElement>('.media-ecoule');
  const r = card.querySelector<HTMLElement>('.media-reste');
  if (e) writeTime(e, formatMediaTime(elapsed));
  if (r) writeTime(r, remaining(a, elapsed));
  if (moveRail) card.style.setProperty('--progression', String(fractionAncree(a, horlogeMs)));
}

function transportButton(
  name: string, entity: string, service: string, primary: boolean, before?: () => void,
): TemplateResult {
  // `name` is the icon name, hence already the button's functional identity: two transport
  // buttons never share it in one render (pause and play are exclusive), and it depends on no
  // array index — which is what the motion engine keys the button by.
  return html`<div class="media-bouton ${primary ? 'principal' : ''} media-${name}"
    data-mvt="detail:tr-${name}"
    @pointerdown=${() => { before?.(); agir('media_player', service, entity); }}>${icone(name)}</div>`;
}

function transportRow(s: SourceResolue, remote: boolean): TemplateResult | '' {
  const t = s.transport;
  if (t === undefined) return '';
  // PAUSE and PLAY are two distinct `supported_features` bits (`CAP`, `media.ts`): the pause
  // button only while playing AND `peutPause`, the play button only when stopped AND
  // `peutLecture` — never a button resting on the other capability. Pausing a source of another
  // room pins it, or it would leave the card (paused is not `active`) under the finger.
  const middle = t.enLecture && t.peutPause
    ? transportButton('pause', t.entite, 'media_pause', true,
        remote ? () => epingler(sourceKey(s)) : undefined)
    : !t.enLecture && t.peutLecture ? transportButton('lecture', t.entite, 'media_play', true)
    : '';
  if (middle === '' && !t.peutPrecedent && !t.peutSuivant) return '';
  return html`<div class="media-transport">
    ${t.peutPrecedent ? transportButton('precedent', t.entite, 'media_previous_track', false) : ''}
    ${middle}
    ${t.peutSuivant ? transportButton('suivant', t.entite, 'media_next_track', false) : ''}
  </div>`;
}

function progressRow(a: Ancre | null): TemplateResult | '' {
  if (a === null) return '';
  const elapsed = secondesAncrees(a, 0);
  return html`<div class="media-progression" data-mvt="detail:media-progression">
    <div class="media-barre"><div class="media-barre-plein"></div></div>
    <div class="media-temps">
      <span class="media-ecoule plaque" data-tone-box>${formatMediaTime(elapsed)}</span>
      <span class="media-reste plaque" data-tone-box>${remaining(a, elapsed)}</span>
    </div>
  </div>`;
}

/** Card colours as custom properties, set ONLY from ready tones: `media.css` falls back on the
 *  theme for each one. The values are `hexFromArgb` output, never external text. */
function toneStyle(tones: ToneState): string {
  if (tones.status !== 'ready') return '';
  const t = tones.tones;
  return `--mc-text:${t.text};--mc-primary:${t.primary};--mc-on-primary:${t.onPrimary};`
    + `--mc-secondary:${t.secondary};--mc-on-secondary:${t.onSecondary};`
    + (t.plate !== undefined ? `--mc-plate:${t.plate};` : '');
}

export function rendreCarteMedia(
  s: SourceResolue,
  // The wall clock, passed in and never read implicitly: it catches up with the time elapsed
  // since Home Assistant read `media_position`, so that the FIRST paint is already right; the
  // tick then moves the bar on the monotonic clock (see `progression.ts`).
  maintenantMs: number,
  tones: ToneState,
  /** The source plays in another room (`pickSource`): pausing it pins it. */
  remote = false,
): TemplateResult {
  // Anchored at monotonic 0: the render takes both clocks at the same instant.
  const ancre = ancrerProgression(s.progression, maintenantMs, 0);
  const poster = s.affiche !== undefined && tones.status === 'ready' ? s.affiche : undefined;
  const label = s.piece ? `EN COURS · ${s.piece}` : 'EN COURS';
  // The whole block is keyed `bloc:media`: a new track is a CONTENT CHANGE under the same key
  // (a mutation the engine crosses), never an exit plus an entry. `data-mvt-etat` carries the
  // title, folded back on `s.nom` for a player that publishes no metadata.
  return html`
    <div class="media ${poster ? 'avec-affiche' : ''}"
      style="--progression:${fractionAncree(ancre, 0)};${toneStyle(tones)}"
      data-zone="blocCentral" data-mvt="bloc:media" data-mvt-etat=${s.titre || s.nom}>
      ${poster
        // A background layer, never an <img> in the flow: a replaced element would take part in
        // the layout and make the block's height depend on the poster's proportions.
        ? html`<div class="media-affiche" style="background-image:url('${urlSure(poster)}')"></div>`
        : ''}
      <div class="media-texte">
        <!-- dir="auto": each text takes its direction from its own first strong character, so a
             right-to-left title reads right to left whatever the page's language. -->
        <div class="t plaque" dir="auto" data-tone-box>${label}</div>
        <div class="v deux-lignes plaque" dir="auto" data-tone-box>${s.titre}</div>
        ${s.sousTitre
          ? html`<div class="media-sous plaque" dir="auto" data-tone-box data-mvt="detail:media-sous">${s.sousTitre}</div>`
          : ''}
      </div>
      ${progressRow(ancre)}
      ${transportRow(s, remote)}
      ${volumeRow(s.volume, agir, () => repeindre())}
    </div>`;
}
