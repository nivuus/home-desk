// @vitest-environment jsdom
/** All-day calendar events are a day, never a time.
 *
 *  Home Assistant serialises an all-day event's start as a bare date (`2026-11-15`), which
 *  `new Date` reads as UTC midnight: east of Greenwich, tomorrow's all-day event became a "01:00"
 *  appointment the evening before, and today's was never shown. The rule must hold in any time
 *  zone, so each case runs in several. */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'lit';
import { pastilleBandeau, type Evenement } from '../src/agenda';
import { rendreProchainRdv } from '../src/rendu/defaut';

const ZONES = ['Europe/Paris', 'Europe/Athens', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati'];
const originalTz = process.env.TZ;
afterEach(() => { process.env.TZ = originalTz; });

const allDay = (resume: string, date: string): Evenement =>
  ({ resume, debut: date, estAnniversaire: false, journeeEntiere: true });
const HOUR_LABEL = /\d{1,2}:\d{2}/;

describe.each(ZONES)('all-day events in %s', (zone) => {
  it("tomorrow's all-day event, late in the evening, produces no hour label", () => {
    process.env.TZ = zone;
    const lateEvening = new Date(2026, 10, 14, 23, 30);
    const badge = pastilleBandeau([allDay('Holiday', '2026-11-15')], [], lateEvening, false);
    expect(badge?.etiquette ?? '').not.toMatch(HOUR_LABEL);
    expect(badge?.valeur ?? '').not.toContain('Holiday');
  });

  it("today's all-day event is announced for today, never as a time", () => {
    process.env.TZ = zone;
    const morning = new Date(2026, 10, 14, 7, 0);
    const badge = pastilleBandeau([allDay('Holiday', '2026-11-14')], [], morning, false);
    expect(badge).toEqual({ etiquette: 'Aujourd\'hui', valeur: 'Holiday' });

    const block = rendreProchainRdv([allDay('Holiday', '2026-11-14')], morning);
    const host = document.createElement('div');
    if (block) render(block, host);
    expect(host.textContent ?? '').not.toMatch(HOUR_LABEL);
  });
});
