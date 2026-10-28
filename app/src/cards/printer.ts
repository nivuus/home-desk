/** The 3D printer card (Bambu Lab, ha-bambulab integration). The printer exists only as a house
 *  appliance (`stack/appliances.ts`): no screen declares one.
 *
 *  Roles: `etat` is the integration's `print_status` sensor, `erreur` its `print_error` binary
 *  sensor; `pause`, `reprise`, `arret` its buttons (`contrat/maison.schema.json` takes `button.*`
 *  only, pressed with `button.press`); `couverture` the cover image entity, `camera` the chamber
 *  camera or image entity, both read through their `entity_picture`.
 *
 *  Source, read 2026-10-24 at greghesp/ha-bambulab 0e027ff:
 *  - `pybambu/const.py` `GCODE_STATE_OPTIONS`: failed, finish, idle, init, offline, pause,
 *    prepare, running, slicing, unknown — `definitions.py` (`print_status`) publishes the gcode
 *    state lowercased, or "offline" when the printer is not online.
 *  - `pybambu/models.py` (`PrintJob.print_update`): FINISH and FAILED last until the next job
 *    starts; a stopped print turns FAILED. Nothing tells the plate was cleared, so a finished
 *    print waits (rank 2) until the status leaves `finish`; "later" is how to dismiss it.
 *  - `pybambu/models.py` (`PrintError`): `print_error` is on while the printer reports an error
 *    code; a filament run out is one (`hms_error_text`, device_error `…8011` "has run out").
 *  - `button.py`: pause is available only while RUNNING, resume only while PAUSE, stop while
 *    RUNNING or PAUSE; `unavailable` otherwise — such a button leaves its place empty.
 *
 *  Not a fault: `etat` unreadable (`unavailable`, `unknown`) is the integration or the printer
 *  gone, as is `offline` — no card; an unreadable `erreur` is no error. An error outside a job
 *  (idle, a code left over) gives no card: only a job waits for a gesture. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import { imageToPaint } from '../boot/card-tones';
import type { Appareil } from '../configuration';
import type { Etat } from '../etat';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { cardEntities, requiredRole, role } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct, laterButton } from './actions';
import { numberOf, percent } from './format';
import { cameraButton, cameraOverlay } from './printer-camera';
import { spoolRow } from './printer-spools';
import { S } from './strings';

const TYPE = 'imprimante';
/** `print_status` → rank. Absent: no card (idle, init, offline, unknown). */
const RANKS: Record<string, 2 | 4> = { running: 4, prepare: 4, slicing: 4, pause: 4, finish: 2, failed: 2 };

const OPTIONAL = ['finTache', 'couche', 'couchesTotal', 'tache', 'couverture', 'camera', 'pause',
  'reprise', 'arret', 'erreur'] as const;
type Printer = { etat: string; progression: string; ams?: string[] }
  & Partial<Record<typeof OPTIONAL[number], string>>;

function adapt(a: Appareil): Printer {
  const p: Printer = { etat: requiredRole(a, 'etat'), progression: requiredRole(a, 'progression') };
  for (const r of OPTIONAL) {
    const id = role(a, r);
    if (id !== undefined) p[r] = id;
  }
  const ams = a.entites['ams'];
  if (Array.isArray(ams)) p.ams = ams;
  return p;
}

const keyOf = (p: Printer): string => `${TYPE}:${p.etat}`;
const status = (etat: Etat, p: Printer): string | undefined =>
  etat.estUtilisable(p.etat) ? etat.lire(p.etat)!.etat : undefined;
const erroring = (etat: Etat, p: Printer): boolean =>
  p.erreur !== undefined && etat.estUtilisable(p.erreur) && etat.lire(p.erreur)!.etat === 'on';

function rankOf(s: ScreenState, p: Printer): Rank | null {
  const r = RANKS[status(s.etat, p) ?? ''];
  if (r === undefined) return null;
  return erroring(s.etat, p) ? 2 : r;
}

const printers = (s: ScreenState): Printer[] =>
  cardEntities(s, { type: TYPE, own: undefined, adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return printers(s).flatMap((p) => {
    const rank = rankOf(s, p);
    return rank === null ? [] : [{ key: keyOf(p), type: TYPE, rank }];
  });
}

const stateOf = (etat: Etat, id: string | undefined): string | undefined =>
  id !== undefined && etat.estUtilisable(id) ? etat.lire(id)!.etat : undefined;

function picture(etat: Etat, id: string | undefined): string | undefined {
  if (id === undefined || !etat.estUtilisable(id)) return undefined;
  const url = etat.lire(id)!.attributs['entity_picture'];
  return typeof url === 'string' && url !== '' ? url : undefined;
}

/** A button entity is pressable unless the integration marks it `unavailable` — a button never
 *  pressed reads `unknown`, and is not the less usable for it. */
function press(etat: Etat, id: string | undefined, b: Omit<CardButton, 'act'>): CardButton | undefined {
  return id === undefined || !etat.isPresent(id) ? undefined : { ...b, act: () => cardAct('button', 'press', id) };
}

/** The end time, with the weekday when it is not today (a long print ends tomorrow). */
function endTime(f: Frame, etat: Etat, id: string | undefined): string | undefined {
  const ms = Date.parse(stateOf(etat, id) ?? '');
  if (!Number.isFinite(ms)) return undefined;
  const sameDay = new Date(ms).toDateString() === new Date(f.maintenantMs).toDateString();
  return S.printEnds(new Intl.DateTimeFormat(undefined,
    { ...(sameDay ? {} : { weekday: 'short' as const }), hour: 'numeric', minute: '2-digit' }).format(new Date(ms)));
}

function layer(etat: Etat, p: Printer): string | undefined {
  const n = numberOf(stateOf(etat, p.couche));
  if (n === null) return undefined;
  const total = numberOf(stateOf(etat, p.couchesTotal));
  const fmt = new Intl.NumberFormat();
  return S.layer(fmt.format(n), total === null ? undefined : fmt.format(total));
}

function errorText(etat: Etat, p: Printer): string | undefined {
  if (!erroring(etat, p)) return undefined;
  const text = etat.lire(p.erreur!)!.attributs['error'];
  return typeof text === 'string' && text !== '' ? text : undefined;
}

export function frame(card: Card, f: Frame, s: ScreenState): CardFrame {
  const p = printers(s).find((x) => keyOf(x) === card.key);
  if (p === undefined) throw new Error(`printer card: no printer for ${card.key}`);
  const st = status(s.etat, p);
  if (st === undefined) throw new Error(`printer card: no state for ${card.key}`);
  const pct = numberOf(stateOf(s.etat, p.progression));
  const job = st !== 'finish' && st !== 'failed';
  const end = job ? endTime(f, s.etat, p.finTache) : undefined;
  const lay = layer(s.etat, p);
  const error = errorText(s.etat, p);
  const cover = picture(s.etat, p.couverture);
  const camera = picture(s.etat, p.camera);
  const overlay = camera === undefined ? undefined : cameraOverlay(card.key, camera);
  return {
    key: card.key,
    label: erroring(s.etat, p) ? S.printerError : S.printerStates[st] ?? S.printer,
    title: stateOf(s.etat, p.tache) ?? S.printer,
    ...(error !== undefined ? { subtitle: error } : {}),
    // Every text here is a tone box: on the cover image, the tones keep each one at 5:1. The
    // details stand beside the figure, spools included: under it, a card with an error subtitle
    // and a two-line title would run out of height.
    middle: html`<div class="carte-chiffres imprimante-chiffres">
        ${pct !== null ? html`<span class="carte-chiffre" data-tone-box>${percent(pct)}</span>` : ''}
        <div class="imprimante-details">
          ${end !== undefined ? html`<span class="carte-ligne" data-tone-box>${end}</span>` : ''}
          ${lay !== undefined ? html`<span class="carte-ligne" data-tone-box>${lay}</span>` : ''}
          ${spoolRow(s.etat, p.ams)}
        </div>
      </div>`,
    buttons: [
      camera === undefined ? undefined : cameraButton(s, card.key),
      st === 'pause' ? press(s.etat, p.reprise, { icon: 'lecture', label: S.printerResume, primary: true })
        : job ? press(s.etat, p.pause, { icon: 'pause', label: S.pause, primary: true })
          // Finished or failed: nothing left to drive, only to dismiss until the plate is cleared.
          : laterButton(s, card.key),
      press(s.etat, p.arret, { icon: 'stop', label: S.printerStop }),
    ],
    ...(cover !== undefined
      ? imageToPaint(card.key, cover, s.measuredCard)
      : { background: { kind: 'solid', token: 'neutral' } }),
    ...(overlay !== undefined ? { overlay } : {}),
    motion: { block: 'bloc:imprimante' },
  };
}
