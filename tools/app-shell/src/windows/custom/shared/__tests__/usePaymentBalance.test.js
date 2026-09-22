import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatPlain, parsePlain, round2 } from '../usePaymentBalance.js';
import { parseLocaleNumber } from '../../../../lib/parseLocaleNumber.js';
import { parseAmountOrZero } from '../../../../lib/parseAmountInput.js';

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
  it('formats a plain integer with the configured grouping and two decimals', () => {
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

  it('falls back to zero for non-finite values', () => {
    assert.equal(formatPlain(NaN), '0,00');
    assert.equal(formatPlain(Infinity), '0,00');
    assert.equal(formatPlain(undefined), '0,00');
  });
});

describe('parsePlain', () => {
  it('parses a grouped amount into a number', () => {
    assert.equal(parsePlain('6.420,00'), 6420);
    assert.equal(parsePlain('1.234.567,89'), 1234567.89);
    assert.equal(parsePlain('5,50'), 5.5);
  });

  it('parses a plain decimal with the configured decimal separator', () => {
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

// ─── ETP-5107 (QA round 2) regression coverage ──────────────────────────────
// The modal used to format/parse in en-US ("6,420.00") while the rest of the app
// uses the instance-configured es-ES convention. A user typing `50,50` on a
// €139,15 invoice had the comma stripped as a thousands separator and paid
// 5.050,00 € — ~36x too much, with the UI then offering to refund the "excess".
describe('parsePlain — ETP-5107 decimal-comma regression', () => {
  it('reads a comma as the decimal separator, not as grouping', () => {
    // The exact reported defect: 50,50 must be fifty-euros-fifty, never 5050.
    assert.equal(parsePlain('50,50'), 50.5);
    assert.notEqual(parsePlain('50,50'), 5050);
  });

  it('strips the configured thousands separator before parsing', () => {
    assert.equal(parsePlain('1.234,56'), 1234.56);
    assert.equal(parsePlain('139,15'), 139.15);
  });

  it('reads a lone period by the digits that follow it, not by the configured convention', () => {
    // The STRUCTURAL rule (lib/parseAmountInput.js, shipped under ETP-4954): a lone
    // separator followed by exactly three digits is grouping, anything else is a
    // decimal point. This pair is the whole point — a rule that always read '.' as
    // grouping (the first ETP-5107 fix) turned a typed `75.50` into 7550.
    assert.equal(parsePlain('5.50'), 5.5); // two digits → a fraction
    assert.equal(parsePlain('1.500'), 1500); // three digits → a thousands group
  });

  it('is NOT the parser for exchange rates (rates go through parseLocaleNumber)', () => {
    // A rate arrives canonical dot-decimal from the backend. `0.92` happens to read the
    // same either way, but a rate of `1.500` legitimately means one-point-five, and the
    // structural rule reads three trailing digits as grouping — which is why
    // NewPaymentEntryModal parses rates with parseLocaleNumber directly. This pins that
    // distinction, and the value that makes it matter.
    assert.equal(parsePlain('0.92'), 0.92);
    assert.equal(parseLocaleNumber('0.92').value, 0.92);
    assert.equal(parsePlain('1.500'), 1500); // wrong for a rate…
    assert.equal(parseLocaleNumber('1.500').value, 1.5); // …which is why rates use this one
  });
});

// ─── ETP-5107 (QA round 3) — the trade-off itself ───────────────────────────
// This ticket broke TWICE in opposite directions: first a hardcoded en-US parse read
// `50,50` as 5050, then the fix read '.' as grouping unconditionally and read `75.50`
// as 7550. Neither direction is acceptable alone, so this block asserts BOTH survive
// together — it fails if anyone reintroduces a convention-driven rule here.
describe('parsePlain — ETP-5107 both-directions regression', () => {
  it('reads a comma-decimal AND a period-decimal amount correctly at the same time', () => {
    assert.equal(parsePlain('50,50'), 50.5); // round 2: must not be 5050
    assert.equal(parsePlain('75.50'), 75.5); // round 3: must not be 7550
  });

  it('still reads an unambiguous grouped amount, both separators present', () => {
    assert.equal(parsePlain('1.250,50'), 1250.5);
    assert.equal(parsePlain('1,250.50'), 1250.5);
  });

  it('still treats a lone separator with three trailing digits as grouping', () => {
    assert.equal(parsePlain('1.500'), 1500);
    assert.equal(parsePlain('1,500'), 1500);
  });

  it('rejects a partially-numeric value instead of salvaging its prefix', () => {
    // parseFloat('45.70abc') would yield 45.7; the amount must be a number in full.
    assert.equal(parsePlain('45.70abc'), null);
    assert.equal(parseAmountOrZero('45.70abc'), 0);
  });
});

describe('formatPlain ↔ parsePlain round-trip (instance-configured format)', () => {
  for (const n of [0, 5, 100, 6420, 6420.5, 1234567.89, 0.99]) {
    it(`round-trips ${n}`, () => {
      assert.equal(parsePlain(formatPlain(n)), round2(n));
    });
  }

  it('round-trips a negative through round2', () => {
    assert.equal(parsePlain(formatPlain(-1234.5)), -1234.5);
  });

  // ETP-5107: a grouped value must survive the display → parse round-trip intact —
  // the formatter's own thousands separator must not be read back as a decimal.
  it('round-trips a grouped amount through its formatted form (ETP-5107)', () => {
    assert.equal(formatPlain(1234.56), '1.234,56');
    assert.equal(parsePlain(formatPlain(1234.56)), 1234.56);
    assert.equal(parsePlain(formatPlain(50.5)), 50.5);
  });
});
