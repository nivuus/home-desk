import { describe, it, expect } from 'vitest';
import { duration } from '../src/cards/format';

// The expectations are built from the same `Intl` calls in the page's locale: the test pins the
// arithmetic and the parts, never one language's words.
const unit = (u: string, n: number) =>
  new Intl.NumberFormat(undefined, { style: 'unit', unit: u, unitDisplay: 'long' }).format(n);
const parts = (...p: string[]) => new Intl.ListFormat(undefined, { type: 'unit', style: 'long' }).format(p);
const MIN = 60_000;

describe('duration', () => {
  it('minutes under an hour', () => {
    expect(duration(25 * MIN)).toBe(unit('minute', 25));
    expect(duration(0)).toBe(unit('minute', 0));
  });
  it('hours and minutes beyond, never floored to the hour', () => {
    expect(duration(119 * MIN)).toBe(parts(unit('hour', 1), unit('minute', 59)));
    expect(duration(61 * MIN)).toBe(parts(unit('hour', 1), unit('minute', 1)));
  });
  it('whole hours alone, without "0 minutes"', () => {
    expect(duration(120 * MIN)).toBe(unit('hour', 2));
  });
  it('rounded to the minute first: 59 min 40 s is one hour', () => {
    expect(duration(59 * MIN + 40_000)).toBe(unit('hour', 1));
  });
});
