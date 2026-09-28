// Quantities of the pantry sheet: fractions of the remaining, the − / + step, the bounds, and how
// a quantity reads on screen. home-stock's base units are 'g', 'ml' and 'piece'.
import { describe, it, expect } from 'vitest';
import {
  stepFor, fromFraction, clampQuantity, increment, formatQuantity,
} from '../src/pantry/quantity';

describe('stepFor', () => {
  it('steps one piece at a time', () => {
    expect(stepFor('piece', 3)).toBe(1);
    expect(stepFor('piece', 500)).toBe(1);
  });

  it('steps 50 g / 50 ml, and 10 under 200', () => {
    expect(stepFor('g', 350)).toBe(50);
    expect(stepFor('g', 200)).toBe(50);
    expect(stepFor('g', 199)).toBe(10);
    expect(stepFor('ml', 1000)).toBe(50);
    expect(stepFor('ml', 150)).toBe(10);
  });
});

describe('fromFraction', () => {
  it('takes all, half or a quarter of the remaining', () => {
    expect(fromFraction('all', 350)).toBe(350);
    expect(fromFraction('half', 350)).toBe(175);
    expect(fromFraction('quarter', 350)).toBe(87.5);
  });

  it('allows fractions of a piece', () => {
    expect(fromFraction('half', 1)).toBe(0.5);
    expect(fromFraction('quarter', 3)).toBe(0.75);
  });

  it('never carries floating noise', () => {
    expect(fromFraction('quarter', 0.1 + 0.2)).toBe(0.08);
    expect(fromFraction('all', 0.1 + 0.2)).toBe(0.1 + 0.2);   // all is the exact remaining
  });
});

describe('clampQuantity', () => {
  it('keeps the quantity within [step, remaining]', () => {
    expect(clampQuantity(0, 350, 50)).toBe(50);
    expect(clampQuantity(400, 350, 50)).toBe(350);
    expect(clampQuantity(175, 350, 50)).toBe(175);
  });

  it('with less left than one step, the only choice is the remaining', () => {
    expect(clampQuantity(50, 30, 50)).toBe(30);
    expect(clampQuantity(10, 30, 50)).toBe(30);
  });
});

describe('increment', () => {
  it('moves by the step, within the bounds', () => {
    expect(increment(175, 350, 'g', 1)).toBe(225);
    expect(increment(175, 350, 'g', -1)).toBe(125);
    expect(increment(340, 350, 'g', 1)).toBe(350);
    expect(increment(60, 350, 'g', -1)).toBe(50);
  });

  it('uses the finer step under 200', () => {
    expect(increment(90, 180, 'ml', 1)).toBe(100);
  });

  it('stays at the remaining when less than one step is left', () => {
    // Under 200 g the step is 10: 5 g left is less than one step.
    expect(increment(5, 5, 'g', 1)).toBe(5);
    expect(increment(5, 5, 'g', -1)).toBe(5);
    expect(increment(0.5, 0.5, 'piece', -1)).toBe(0.5);
  });

  it('with 30 g left, the finer step still lets − go down to 10', () => {
    expect(increment(30, 30, 'g', -1)).toBe(20);
    expect(increment(10, 30, 'g', -1)).toBe(10);
  });

  it('counts pieces one by one, even from a fraction', () => {
    expect(increment(1.5, 3, 'piece', 1)).toBe(2.5);
    expect(increment(0.75, 3, 'piece', -1)).toBe(1);
  });
});

describe('formatQuantity', () => {
  it('writes grams and millilitres without decimals when whole', () => {
    expect(formatQuantity(350, 'g')).toBe('350 g');
    expect(formatQuantity(250, 'ml')).toBe('250 ml');
  });

  it('writes at most two decimals, with a French decimal comma', () => {
    expect(formatQuantity(87.5, 'g')).toBe('87,5 g');
    expect(formatQuantity(0.1 + 0.2, 'ml')).toBe('0,3 ml');
    expect(formatQuantity(1 / 3, 'g')).toBe('0,33 g');
  });

  it('writes pieces in the singular below two, plural from two', () => {
    expect(formatQuantity(0.5, 'piece')).toBe('0,5 pièce');
    expect(formatQuantity(1, 'piece')).toBe('1 pièce');
    expect(formatQuantity(1.5, 'piece')).toBe('1,5 pièce');
    expect(formatQuantity(3, 'piece')).toBe('3 pièces');
  });

  it('keeps an unknown unit as sent, and a missing one out', () => {
    expect(formatQuantity(2, 'kg')).toBe('2 kg');
    expect(formatQuantity(2, '')).toBe('2');
  });
});
