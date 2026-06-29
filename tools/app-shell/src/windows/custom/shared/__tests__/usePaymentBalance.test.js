import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatPlain, parsePlain, round2 } from '../usePaymentBalance.js';

// Pure helper coverage for the cuadre (balancing) module. The stateful
// usePaymentBalance hook itself is exercised in usePaymentBalance.vitest.jsx
// (renderHook); this node:test file pins the side-effect-free helpers and
// satisfies the co-located .test.js convention for new source files.

describe('round2', () => {
  it('rounds to two decimals', () => {
    assert.equal(round2(1.014), 1.01);
    assert.equal(round2(1.016), 1.02);
    assert.equal(round2(6420), 6420);
  });

  it('avoids binary float drift', () => {
    // 0.1 + 0.2 === 0.30000000000000004 — round2 collapses it back to 0.3.
    assert.equal(round2(0.1 + 0.2), 0.3);
  });

  it('coerces non-numbers to 0', () => {
    assert.equal(round2('abc'), 0);
    assert.equal(round2(null), 0);
    assert.equal(round2(undefined), 0);
    assert.equal(round2(NaN), 0);
  });

  it('handles negatives', () => {
    assert.equal(round2(-1.005), -1.0); // Math.round(-100.5) === -100
    assert.equal(round2(-1.234), -1.23);
  });
});

describe('formatPlain', () => {
  it('formats a plain integer with es-ES grouping and two decimals', () => {
    assert.equal(formatPlain(6420), '6.420,00');
    assert.equal(formatPlain(0), '0,00');
    assert.equal(formatPlain(5), '5,00');
  });

  it('groups thousands and millions', () => {
    assert.equal(formatPlain(1234567.89), '1.234.567,89');
    assert.equal(formatPlain(1000), '1.000,00');
  });

  it('keeps two decimal places', () => {
    assert.equal(formatPlain(6420.5), '6.420,50');
    assert.equal(formatPlain(6420.555), '6.420,56'); // toFixed rounds
  });

  it('renders negatives with a leading minus', () => {
    assert.equal(formatPlain(-1234.5), '-1.234,50');
  });

  it('falls back to 0,00 for non-finite values', () => {
    assert.equal(formatPlain(NaN), '0,00');
    assert.equal(formatPlain(Infinity), '0,00');
    assert.equal(formatPlain(undefined), '0,00');
  });
});

describe('parsePlain', () => {
  it('parses an es-ES grouped amount into a number', () => {
    assert.equal(parsePlain('6.420,00'), 6420);
    assert.equal(parsePlain('1.234.567,89'), 1234567.89);
    assert.equal(parsePlain('5,50'), 5.5);
  });

  it('parses a plain decimal with comma', () => {
    assert.equal(parsePlain('0,99'), 0.99);
    assert.equal(parsePlain('100'), 100);
  });

  it('returns null for blank input', () => {
    assert.equal(parsePlain(''), null);
    assert.equal(parsePlain('   '), null);
    assert.equal(parsePlain(null), null);
    assert.equal(parsePlain(undefined), null);
  });

  it('returns null for non-numeric input', () => {
    assert.equal(parsePlain('abc'), null);
  });

  it('trims surrounding whitespace', () => {
    assert.equal(parsePlain('  6.420,00  '), 6420);
  });
});

describe('formatPlain ↔ parsePlain round-trip (es-ES)', () => {
  for (const n of [0, 5, 100, 6420, 6420.5, 1234567.89, 0.99]) {
    it(`round-trips ${n}`, () => {
      assert.equal(parsePlain(formatPlain(n)), round2(n));
    });
  }

  it('round-trips a negative through round2', () => {
    assert.equal(parsePlain(formatPlain(-1234.5)), -1234.5);
  });
});
