/** The media card: the only photographic element of the whole application (rule 2 of the
 *  coherence spec — one image on screen, never two, which is what makes it a focal point).
 *
 *  It renders in the shared card frame (`card-frame.ts`): header `EN COURS · <room>`, title (two
 *  lines at most), subtitle; in the middle zone an 8 px progress bar with elapsed and remaining
 *  times, then the volume row (`−`, level, `+`); the transport (previous, play/pause as the
 *  primary disc, next) in the frame's three button slots. A row without data is not rendered and
 *  a transport button the player cannot honour leaves its slot empty: the card keeps its size,
 *  it never shows an empty box or a dead button.
 *
 *  Colours (spec 2026-10-23, "Couleurs"): with a readable poster (`ToneState` ready), the poster
 *  covers the whole card untouched — no veil, no reduced opacity, no gradient — and the tones
 *  derived from it (`tones.ts`) colour the text, the discs and the bars. Pending, unreadable or
 *  no poster: theme colours, same layout, same solid discs. */
import { html, type TemplateResult } from 'lit';
import type { SourceResolue } from '../media';
import { sourceKey } from '../media-choice';
import { ancrerProgression, fractionAncree, secondesAncrees, type Ancre } from '../progression';
import type { ToneState } from './poster-sampler';
import { renderCardFrame, type CardButton, type CardFrame } from './card-frame';
import { S } from '../cards/strings';
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
 *  existing text nodes (`writeTime`) and the bar through `--progression` on the progress row; the next `dessiner()`
 *  rewrites the exact values anyway. */
export function writeProgress(card: HTMLElement, a: Ancre, horlogeMs: number, moveRail: boolean): void {
  const elapsed = secondesAncrees(a, horlogeMs);
  const e = card.querySelector<HTMLElement>('.media-ecoule');
  const r = card.querySelector<HTMLElement>('.media-reste');
  if (e) writeTime(e, formatMediaTime(elapsed));
  if (r) writeTime(r, remaining(a, elapsed));
  const rail = card.querySelector<HTMLElement>('.media-progression');
  if (moveRail && rail) rail.style.setProperty('--progression', String(fractionAncree(a, horlogeMs)));
}

const TRANSPORT_LABEL = { precedent: S.previous, pause: S.pause, lecture: S.play, suivant: S.next };

function transportButton(
  name: keyof typeof TRANSPORT_LABEL, entity: string, service: string, primary: boolean,
  before?: () => void,
): CardButton {
  // `name` is the icon name, hence already the button's functional identity: two transport
  // buttons never share it in one render (pause and play are exclusive), and it depends on no
  // array index — which is what the motion engine keys the button by.
  return {
    icon: name, label: TRANSPORT_LABEL[name], mvt: `detail:tr-${name}`,
    act: () => { before?.(); agir('media_player', service, entity); },
    ...(primary ? { primary: true as const } : {}),
  };
}

function transportButtons(s: SourceResolue, remote: boolean):
  [CardButton?, CardButton?, CardButton?] {
  const t = s.transport;
  if (t === undefined) return [undefined, undefined, undefined];
  // PAUSE and PLAY are two distinct `supported_features` bits (`CAP`, `media.ts`): the pause
  // button only while playing AND `peutPause`, the play button only when stopped AND
  // `peutLecture` — never a button resting on the other capability. Pausing a source of another
  // room pins it, or it would leave the card (paused is not `active`) under the finger.
  const middle = t.enLecture && t.peutPause
    ? transportButton('pause', t.entite, 'media_pause', true,
        remote ? () => epingler(sourceKey(s)) : undefined)
    : !t.enLecture && t.peutLecture ? transportButton('lecture', t.entite, 'media_play', true)
    : undefined;
  return [
    t.peutPrecedent ? transportButton('precedent', t.entite, 'media_previous_track', false) : undefined,
    middle,
    t.peutSuivant ? transportButton('suivant', t.entite, 'media_next_track', false) : undefined,
  ];
}

function progressRow(a: Ancre | null): TemplateResult | '' {
  if (a === null) return '';
  const elapsed = secondesAncrees(a, 0);
  // `--progression` lives on the row: the bar reads it, and the one-second tick moves it there.
  return html`<div class="media-progression" style="--progression:${fractionAncree(a, 0)}"
    data-mvt="detail:media-progression">
    <div class="media-barre"><div class="media-barre-plein"></div></div>
    <div class="media-temps">
      <span class="media-ecoule" data-tone-box>${formatMediaTime(elapsed)}</span>
      <span class="media-reste" data-tone-box>${remaining(a, elapsed)}</span>
    </div>
  </div>`;
}

export function rendreCarteMedia(
  s: SourceResolue, maintenantMs: number, tones: ToneState, remote = false,
): TemplateResult {
  return renderCardFrame(mediaFrame(s, maintenantMs, tones, remote));
}

/** The media card as a stack frame (`rendu/stack.ts`); `rendreCarteMedia` draws it alone. */
export function mediaFrame(
  s: SourceResolue,
  // The wall clock, passed in and never read implicitly: it catches up with the time elapsed
  // since Home Assistant read `media_position`, so that the FIRST paint is already right; the
  // tick then moves the bar on the monotonic clock (see `progression.ts`).
  maintenantMs: number,
  tones: ToneState,
  /** The source plays in another room (`pickSource`): pausing it pins it. */
  remote = false,
): CardFrame {
  // Anchored at monotonic 0: the render takes both clocks at the same instant.
  const ancre = ancrerProgression(s.progression, maintenantMs, 0);
  // The whole block is keyed `bloc:media`: a new track is a CONTENT CHANGE under the same key
  // (a mutation the engine crosses), never an exit plus an entry. `data-mvt-etat` carries the
  // title, folded back on `s.nom` for a player that publishes no metadata.
  return {
    key: `media:${sourceKey(s)}`,
    className: 'media',
    label: s.piece ? `${S.mediaPlaying}${S.separator}${s.piece}` : S.mediaPlaying,
    title: s.titre,
    ...(s.sousTitre ? { subtitle: s.sousTitre } : {}),
    middle: html`${progressRow(ancre)}${volumeRow(s.volume, agir, () => repeindre())}`,
    buttons: transportButtons(s, remote),
    background: s.affiche !== undefined ? { kind: 'image', url: s.affiche } : { kind: 'theme' },
    tones,
    motion: { block: 'bloc:media', state: s.titre || s.nom, subtitle: 'detail:media-sous' },
  };
}
