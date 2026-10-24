/** The volume row of the media card: `−` / level / `+`.
 *
 *  Two kinds of player, never mixed (spec 2026-10-23, "Volume"):
 *  - it publishes `volume_level` (bit `VOLUME_SET`): `+`/`−` call `volume_set` 5 % away, the new
 *    level is shown AT ONCE (before Home Assistant answers, through a repaint) and holding a
 *    button repeats (`hold-repeat.ts`);
 *  - it only steps (`VOLUME_STEP`, no level): `+`/`−` call `volume_up`/`volume_down` and NO level
 *    is shown — never a gauge filled at an invented value.
 *  A settable player that publishes no level gets no row at all: stepping from an unknown level
 *  would invent one. */
import { html, type TemplateResult } from 'lit';
import type { SourceResolue } from '../media';
import { cardPress, type CardPressHandlers } from '../stack/swipe';

type Act = (domain: string, service: string, entity: string, data?: Record<string, unknown>) => void;

/** Steps per full scale: the level moves and snaps by whole 5 % steps. */
const GRID = 20;

/** One step up or down, snapped to the 5 % grid and clamped to [0, 1]. Snapping (not adding)
 *  keeps a level set elsewhere (42 %) from drifting off the grid forever, and the integer
 *  division leaves no float artefact (0.1 + 0.05 is 0.15000000000000002). */
export function stepVolume(level: number, direction: 1 | -1): number {
  const grid = level * GRID;
  // A level already on the grid moves one whole step; one between two steps lands on the next
  // one in the asked direction. The epsilon absorbs the float error of `level * GRID`.
  const next = direction > 0 ? Math.floor(grid + 1e-9) + 1 : Math.ceil(grid - 1e-9) - 1;
  return Math.min(GRID, Math.max(0, next)) / GRID;
}

/** 0 → 100 % in about four seconds of holding. */
const HOLD = { delayMs: 400, everyMs: 200 };

/** How long a released level waits for Home Assistant to reach it before the published level
 *  takes over again: a refused or clamped change must not leave an invented level on screen. */
export const PENDING_MS = 3000;

/** The level asked for, per entity, while Home Assistant has not reached it. The RENDER shows
 *  it, so a late echo of an intermediate step (every `volume_set` comes back as a state change
 *  and a redraw) never moves the shown level backwards, and the next step starts from it. */
type Pending = { level: number; pressing: boolean; expiry?: ReturnType<typeof setTimeout> };
const pending = new Map<string, Pending>();

/** What the row shows: the pending level while pressing, or after the release until Home
 *  Assistant publishes it (then the published level again, so a later change made elsewhere
 *  shows at once) or until `PENDING_MS` runs out. */
function shownLevel(entity: string, published: number): number {
  const p = pending.get(entity);
  if (p === undefined) return published;
  if (!p.pressing && Math.abs(p.level - published) < 1e-6) {
    clearTimeout(p.expiry);
    pending.delete(entity);
    return published;
  }
  return p.level;
}

/** A settable step: one step on a tap, repeated while held (`cardPress` with `hold`). A swipe
 *  that starts on the button steps nothing, and one that starts after the hold stops it. */
function settable(act: Act, repaint: () => void, entity: string, published: number,
  direction: 1 | -1): CardPressHandlers {
  const step = (): void => {
    const from = pending.get(entity)?.level ?? published;
    const to = stepVolume(from, direction);
    if (to === from) return;   // already at the end: nothing to ask the player
    clearTimeout(pending.get(entity)?.expiry);
    pending.set(entity, { level: to, pressing: true });
    act('media_player', 'volume_set', entity, { volume_level: to });
    repaint();
  };
  return cardPress(step, { ...HOLD, onEnd: () => {
    const p = pending.get(entity);
    if (p === undefined || !p.pressing) return;
    p.pressing = false;
    p.expiry = setTimeout(() => {
      if (pending.get(entity) === p) pending.delete(entity);
      repaint();
    }, PENDING_MS);
    repaint();
  } });
}

/** A step button follows the card-button rule (`cardPress`): it acts on release, so a swipe
 *  between cards that starts on it changes nothing. */
function button(name: 'moins' | 'plus', p: CardPressHandlers): TemplateResult {
  return html`<div class="media-pas disque" data-mvt="detail:volume-${name}"
    @pointerdown=${p.onpointerdown} @pointermove=${p.onpointermove}
    @pointerup=${p.onpointerup} @pointercancel=${p.onpointercancel}
    >${name === 'moins' ? '−' : '+'}</div>`;
}

const percent = (level: number): string => `${Math.round(level * 100)}\u00a0%`;

export function volumeRow(
  v: SourceResolue['volume'], act: Act, repaint: () => void,
): TemplateResult | '' {
  if (v === undefined) return '';
  if (v.parPas) {
    return html`<div class="media-volume">
      ${button('moins', cardPress(() => act('media_player', 'volume_down', v.entite)))}
      <div></div>
      ${button('plus', cardPress(() => act('media_player', 'volume_up', v.entite)))}
    </div>`;
  }
  if (v.niveau === undefined) return '';
  const level = shownLevel(v.entite, v.niveau);
  return html`<div class="media-volume" style="--niveau:${level}">
    ${button('moins', settable(act, repaint, v.entite, v.niveau, -1))}
    <div class="media-niveau" data-mvt="detail:volume-niveau">
      <div class="media-niveau-texte plaque" data-tone-box>${percent(level)}</div>
      <div class="media-jauge"><div class="media-jauge-plein"></div></div>
    </div>
    ${button('plus', settable(act, repaint, v.entite, v.niveau, 1))}
  </div>`;
}
