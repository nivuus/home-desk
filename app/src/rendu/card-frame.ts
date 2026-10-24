/** The frame every stack card shares (spec 2026-10-24, "Anatomie d'une carte"): 311 × 264,
 *  a header (label, title on two lines at most, optional subtitle), a middle zone that belongs to
 *  the card, and three fixed slots of 62 px round icon buttons, the centre one primary.
 *
 *  A slot without a real action stays EMPTY (`.vide`): left, centre and right keep their place,
 *  and no placeholder or dead button is ever drawn. A button's `label` is its `aria-label` only —
 *  a card button never shows text.
 *
 *  Backgrounds: an image (the subject's own picture) shown untouched as a cover layer, coloured
 *  through its tones (`poster-sampler.ts`); a solid colour named by a token (`cards.css`); or
 *  the theme's own colours.
 *  Never a gradient, never a veil. */
import { html, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { live } from 'lit/directives/live.js';
import type { ToneState } from './poster-sampler';
import { icone } from './icones';
import { cardPress, type CardPressHandlers, type HoldPress } from '../stack/swipe';

export const SOLID_TOKENS = ['neutral', 'timer', 'timer-late', 'charging', 'plug-in',
  'air-bad', 'calm'] as const;
export type SolidToken = typeof SOLID_TOKENS[number];

export type CardBackground =
  | { kind: 'image'; url: string }
  | { kind: 'solid'; token: SolidToken }           // a colour, never a gradient
  /** The page's palette: an image card whose subject has no picture (a player without a poster)
   *  looks exactly like one whose picture is still being read. */
  | { kind: 'theme' };

export type CardButton = {
  icon: string; label: string; primary?: true; act: () => void; inert?: true;
  /** Motion-engine key of the button (`data-mvt`), when it animates on its own. */
  mvt?: string;
  /** What holding the button does (`cardPress`): repeat, or its own `fire`. */
  hold?: HoldPress;
};

export type CardFrame = {
  key: string; label: string; title: string; subtitle?: string;
  middle: TemplateResult; buttons: [CardButton?, CardButton?, CardButton?];
  background: CardBackground; tones?: ToneState;   // only for 'image'
  /** Motion-engine identity: the block key and state, and the subtitle's detail key. */
  motion?: { block: string; state?: string; subtitle?: string };
  /** Extra root classes, for a card's own styles (`media`). */
  className?: string;
  /** A picture laid over the whole card, text and buttons included, while it is asked for (the
   *  printer's camera, held): nothing is read on it, so no tone applies. */
  overlay?: string;
};

/** Hardens an image URL before it lands in `style="background-image:url('…')"`: `lit` escapes
 *  nothing inside an attribute, and the URL is not ours (a third-party integration, a file
 *  name). Only what can leave `url('…')` is percent-encoded — both quotes, the parentheses, the
 *  backslash (the CSS escape) and any white space. `encodeURI` was tried and REJECTED: it encodes
 *  `%` into `%25` and breaks every already percent-encoded URL (`Mon%20affiche.png`). The server
 *  reads the percent-encoding back as the original character, so the image still loads. */
export function urlSure(u: string): string {
  return String(u).replace(/['"()\\]|\s/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/** Image card colours as custom properties, set ONLY from ready tones: `cards.css` falls back on
 *  the theme for each one. The values are `hexFromArgb` output, never external text. */
function toneStyle(tones: ToneState | undefined): string {
  if (tones?.status !== 'ready') return '';
  const t = tones.tones;
  return `--mc-text:${t.text};--mc-primary:${t.primary};--mc-on-primary:${t.onPrimary};`
    + `--mc-secondary:${t.secondary};--mc-on-secondary:${t.onSecondary};`
    + (t.plate !== undefined ? `--mc-plate:${t.plate};` : '');
}

const SOLID_ROLES = ['fond', 'texte', 'icone', 'disque', 'primaire', 'sur-primaire'] as const;

/** A solid card reads its colours through `--c-*`, pointed at the token's `--carte-<token>-*`
 *  values in `cards.css`: one rule set for every token, and the token is a literal of ours. */
export const solidStyle = (token: SolidToken): string =>
  SOLID_ROLES.map((r) => `--c-${r}:var(--carte-${token}-${r});`).join('');

/** A card button acts on release, not on contact: a swipe that starts on it must not fire it
 *  (`stack/swipe.ts`, `cardPress`). An inert button binds nothing; a handler left undefined is not
 *  bound by `lit`. */
const NO_PRESS: Partial<CardPressHandlers> = {};

function slot(b: CardButton | undefined): TemplateResult {
  if (b === undefined) return html`<div class="vide" aria-hidden="true"></div>`;
  // An inert button keeps its place and its icon but binds nothing; `inert` also keeps it out of
  // focus and hit-testing, and `.inerte` drops the press feedback (same rule as `.absent`).
  const p = b.inert ? NO_PRESS : cardPress(b.act, b.hold);
  return html`<div class="bouton disque ${b.primary ? 'primaire' : ''} ${b.inert ? 'inerte' : ''}"
    role="button" aria-label=${b.label} ?inert=${b.inert === true} data-mvt=${ifDefined(b.mvt)}
    @pointerdown=${p.onpointerdown} @pointermove=${p.onpointermove}
    @pointerup=${p.onpointerup} @pointercancel=${p.onpointercancel}>${icone(b.icon)}</div>`;
}

/** `position`: the stack's dots (`rendu/stack.ts`), drawn at the end of the label row so the
 *  card stays 311 × 264 whatever the stack holds — a row under the card would bill its height. */
export function renderCardFrame(f: CardFrame, position?: TemplateResult): TemplateResult {
  const bg = f.background;
  // The picture only once its tones are ready: pending or unreadable, the card keeps the theme
  // colours, same layout.
  const image = bg.kind === 'image' && f.tones?.status === 'ready' ? bg.url : undefined;
  const style = bg.kind === 'solid' ? solidStyle(bg.token) : bg.kind === 'image' ? toneStyle(f.tones) : '';
  // `live`: the per-second tick turns a timer card late by writing this attribute between two
  // renders (`tictacMinuteurs`); compared with the DOM, never with the last value `lit` wrote, a
  // card that is no longer late (paused, a minute added) gets its colour back.
  return html`<section class="carte ${f.className ?? ''} ${image !== undefined ? 'avec-image' : ''}"
      style=${live(style)} data-zone="blocCentral" data-card=${f.key}
      data-mvt=${ifDefined(f.motion?.block)} data-mvt-etat=${ifDefined(f.motion?.state)}>
    ${image !== undefined
      // A background layer, never an <img> in the flow: a replaced element would take part in the
      // layout, and `poster-sampler.ts` measures exactly this layer's cover crop.
      ? html`<div class="carte-image" style="background-image:url('${urlSure(image)}')"></div>`
      : ''}
    <div class="entete">
      <!-- dir="auto": each text takes its direction from its own first strong character. -->
      <div class="ligne-etiquette">
        <div class="etiquette plaque" dir="auto" data-tone-box>${f.label}</div>${position ?? ''}
      </div>
      <div class="titre deux-lignes plaque" dir="auto" data-tone-box>${f.title}</div>
      ${f.subtitle
        ? html`<div class="sous-titre plaque" dir="auto" data-tone-box
            data-mvt=${ifDefined(f.motion?.subtitle)}>${f.subtitle}</div>`
        : ''}
    </div>
    <div class="milieu">${f.middle}</div>
    <div class="actions">${slot(f.buttons[0])}${slot(f.buttons[1])}${slot(f.buttons[2])}</div>
    ${f.overlay !== undefined
      // Last child, over everything; `pointer-events: none` (`cards.css`) keeps the press that
      // asked for it on its own button.
      ? html`<div class="carte-camera" style="background-image:url('${urlSure(f.overlay)}')"></div>`
      : ''}
  </section>`;
}
