/** The volume row of the media card: `−` / level / `+`.
 *
 *  Two kinds of player, never mixed (spec 2026-10-23, "Volume"):
 *  - it publishes `volume_level` (bit `VOLUME_SET`): `+`/`−` call `volume_set` 5 % away, the new
 *    level is shown AT ONCE (before Home Assistant answers) and holding a button repeats;
 *  - it only steps (`VOLUME_STEP`, no level): `+`/`−` call `volume_up`/`volume_down` and NO level
 *    is shown — never a gauge filled at an invented value.
 *  A settable player that publishes no level gets no row at all: stepping from an unknown level
 *  would invent one. */
import { html, type TemplateResult } from 'lit';
import type { SourceResolue } from '../media';
import { writeTime } from './minuteur';

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

const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'pointerleave'] as const;

/** Fires once now, then every `everyMs` once the press has lasted `delayMs`, until the finger
 *  lifts, is cancelled or leaves the button. Returns the same stop function the release calls. */
export function holdRepeat(
  el: HTMLElement, fire: () => void, opts: { delayMs: number; everyMs: number } = HOLD,
): () => void {
  let repeat: ReturnType<typeof setInterval> | undefined;
  fire();
  const delay = setTimeout(() => { repeat = setInterval(fire, opts.everyMs); }, opts.delayMs);
  const stop = (): void => {
    clearTimeout(delay);
    if (repeat !== undefined) clearInterval(repeat);
    for (const type of RELEASE_EVENTS) el.removeEventListener(type, stop);
  };
  for (const type of RELEASE_EVENTS) el.addEventListener(type, stop);
  return stop;
}

const percent = (level: number): string => `${Math.round(level * 100)} %`;

/** Writes a level on the row without a `lit` render: the gauge through `--niveau`, the text
 *  through its existing text node (`writeTime` — replacing `textContent` would drop lit's
 *  marker), the level itself in `data-niveau` for the next press. The next render rewrites all
 *  three only once Home Assistant publishes a different level. */
function showLevel(row: HTMLElement, level: number): void {
  row.dataset.niveau = String(level);
  row.style.setProperty('--niveau', String(level));
  const text = row.querySelector<HTMLElement>('.media-niveau-texte');
  if (text) writeTime(text, percent(level));
}

function settable(act: Act, entity: string, direction: 1 | -1) {
  return (ev: PointerEvent): void => {
    const button = ev.currentTarget as HTMLElement;
    const row = button.closest<HTMLElement>('.media-volume')!;
    holdRepeat(button, () => {
      const from = Number(row.dataset.niveau);
      const to = stepVolume(from, direction);
      if (to === from) return;   // already at the end: nothing to ask the player
      showLevel(row, to);
      act('media_player', 'volume_set', entity, { volume_level: to });
    });
  };
}

function button(name: 'moins' | 'plus', onDown: (ev: PointerEvent) => void): TemplateResult {
  return html`<div class="media-pas" data-mvt="detail:volume-${name}"
    @pointerdown=${onDown}>${name === 'moins' ? '−' : '+'}</div>`;
}

export function volumeRow(v: SourceResolue['volume'], act: Act): TemplateResult | '' {
  if (v === undefined) return '';
  if (v.parPas) {
    return html`<div class="media-volume">
      ${button('moins', () => act('media_player', 'volume_down', v.entite))}
      <div></div>
      ${button('plus', () => act('media_player', 'volume_up', v.entite))}
    </div>`;
  }
  if (v.niveau === undefined) return '';
  return html`<div class="media-volume" data-niveau=${v.niveau} style="--niveau:${v.niveau}">
    ${button('moins', settable(act, v.entite, -1))}
    <div class="media-niveau" data-mvt="detail:volume-niveau">
      <div class="media-niveau-texte plaque" data-tone-box>${percent(v.niveau)}</div>
      <div class="media-jauge"><div class="media-jauge-plein"></div></div>
    </div>
    ${button('plus', settable(act, v.entite, 1))}
  </div>`;
}
