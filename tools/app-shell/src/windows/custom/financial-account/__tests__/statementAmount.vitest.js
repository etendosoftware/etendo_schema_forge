import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  parseStatementAmount,
  parseAmount,
  isInvalidStatementAmount,
} from '../statementAmount.js';

/**
 * ETP-4954 — the one amount parser shared by the manual statement form and the CSV/Excel
 * import. Pure JS, so it runs here under the vitest runner with node:assert.
 *
 * The contract has exactly three outcomes and the import pipeline needs all three kept
 * apart: a number, `null` for a blank cell (a line is an inflow OR an outflow, never both),
 * and `NaN` for a cell holding something that is not a number (a row error the review queue
 * must surface BEFORE the send). Collapsing blank and unparseable — which `parseAmount` does
 * on purpose for the manual grid — is a lossy view, not the base contract.
 *
 * The reading of a separator follows three rules, each with its own block below:
 *
 *  1. both separators present → the RIGHTMOST is the decimal;
 *  2. one separator followed by exactly THREE digits → thousands;
 *  3. otherwise → decimal.
 */
describe('parseStatementAmount', () => {
  // Rule 1 — a cell carrying both separators is unambiguous whichever convention wrote it,
  // so a file exported as Spanish imports correctly under English and vice versa.
  describe('rule 1 — both separators: the rightmost one is the decimal', () => {
    it('reads a Spanish-notation amount (dot thousands, comma decimal)', () => {
      assert.equal(parseStatementAmount('3.500,00'), 3500);
      assert.equal(parseStatementAmount('1.234,56'), 1234.56);
    });

    it('reads an English-notation amount (comma thousands, dot decimal) as the same number', () => {
      assert.equal(parseStatementAmount('3,500.00'), 3500);
      assert.equal(parseStatementAmount('1,234.56'), 1234.56);
    });

    it('reads several thousands groups before the decimal', () => {
      assert.equal(parseStatementAmount('1.234.567,89'), 1234567.89);
    });
  });

  /**
   * Rule 2 — the fix for a silent 1000x corruption. A lone separator used to be a decimal
   * point unconditionally, so `1.234` became 1.234 and rendered — after rounding to two
   * decimals — as `1,23 €`. Every amount written with a thousands separator and no decimals
   * was divided by a thousand, with nothing flagging it.
   *
   * The rule counts digits rather than consulting a decimal convention because money carries
   * at most two decimals: three digits after a lone separator is grouping, two is a fraction.
   */
  describe('rule 2 — one separator + exactly three digits: thousands', () => {
    it('reads a lone dot before three digits as a thousands separator', () => {
      assert.equal(parseStatementAmount('1.234'), 1234);
      assert.equal(parseStatementAmount('12.345'), 12345);
      assert.equal(parseStatementAmount('1.500'), 1500);
    });

    it('reads a lone comma before three digits as a thousands separator', () => {
      assert.equal(parseStatementAmount('1,234'), 1234);
    });

    it('reads repeated three-digit groups as one grouped number', () => {
      assert.equal(parseStatementAmount('1.234.567'), 1234567);
      assert.equal(parseStatementAmount('1,234,567'), 1234567);
    });

    // Grouping never follows a bare 0, so a leading lone zero is the one shape where three
    // digits still read as a fraction: `0.500` is fifty cents, never five hundred.
    it('exempts a lone leading zero — `0.500` is 0.5, not 500', () => {
      assert.equal(parseStatementAmount('0.500'), 0.5);
      assert.equal(parseStatementAmount('0,500'), 0.5);
    });

    it('exempts a lone leading zero with a sign too — `-0.500` is -0.5', () => {
      assert.equal(parseStatementAmount('-0.500'), -0.5);
    });
  });

  describe('rule 3 — anything else: the separator is the decimal point', () => {
    it('reads a plain dot-decimal amount', () => {
      assert.equal(parseStatementAmount('1500.50'), 1500.5);
      assert.equal(parseStatementAmount('1800.25'), 1800.25);
    });

    it('reads a plain comma-decimal amount', () => {
      assert.equal(parseStatementAmount('1500,50'), 1500.5);
      assert.equal(parseStatementAmount('99,90'), 99.9);
    });

    // Two digits is a fraction — this is the deliberate divergence from Classic, which forces
    // its locale's convention and turns `1.23` into 123.
    it('reads two digits after the separator as a fraction, not a group', () => {
      assert.equal(parseStatementAmount('1.23'), 1.23);
      assert.equal(parseStatementAmount('12.3'), 12.3);
    });

    // Four digits is not a thousands group either, so it stays a (sub-cent) fraction.
    it('reads four digits after the separator as a fraction', () => {
      assert.equal(parseStatementAmount('1.2345'), 1.2345);
    });

    it('reads a separator-free integer', () => {
      assert.equal(parseStatementAmount('100'), 100);
      assert.equal(parseStatementAmount('0'), 0);
    });
  });

  /**
   * The three sources that share this parser, and the whole reason rule 2 counts digits
   * instead of consulting the instance's decimal convention: `1.234` and `1800.25` are
   * structurally identical strings needing opposite readings, so no single convention can
   * serve both. Applying the Spanish one turned every Excel amount into 180025 and every
   * typed `1500.50` into 150050 — these cases pin that regression shut.
   */
  describe('the three sources sharing this parser', () => {
    it('source 1 — a CSV cell: text a bank wrote, `1.234` meaning 1234', () => {
      assert.equal(parseStatementAmount('1.234'), 1234);
    });

    // `parseXlsx` stringifies a real numeric cell with `String(value)`, so an Excel amount
    // always arrives in the canonical dot-decimal form regardless of how Excel displayed it.
    it('source 2 — an xlsx numeric cell: `String(1800.25)` arrives dot-decimal', () => {
      assert.equal(parseStatementAmount(String(1800.25)), 1800.25);
      assert.equal(parseStatementAmount('1800.25'), 1800.25);
    });

    it('source 2 — an xlsx numeric cell with one decimal: `String(410.5)` is 410.5, not 4105', () => {
      assert.equal(parseStatementAmount(String(410.5)), 410.5);
      assert.equal(parseStatementAmount('410.5'), 410.5);
    });

    it('source 3 — manual-grid typed input: `1500.50` is 1500.5, not 150050', () => {
      assert.equal(parseStatementAmount('1500.50'), 1500.5);
    });

    it('source 3 — manual-grid input already held as a number', () => {
      assert.equal(parseStatementAmount(1500.5), 1500.5);
      assert.equal(parseStatementAmount(0), 0);
    });
  });

  describe('blank and unparseable cells', () => {
    it('returns null for a blank cell, so "no amount on this side" is not an error', () => {
      assert.equal(parseStatementAmount(''), null);
      assert.equal(parseStatementAmount('   '), null);
      assert.equal(parseStatementAmount(null), null);
      assert.equal(parseStatementAmount(undefined), null);
    });

    it('returns NaN for a non-numeric cell, keeping it distinct from a blank one', () => {
      assert.ok(Number.isNaN(parseStatementAmount('abc')));
      assert.notEqual(parseStatementAmount('abc'), null);
    });

    it('returns NaN for a word, however plausible', () => {
      assert.ok(Number.isNaN(parseStatementAmount('ochenta')));
    });

    // `parseFloat` alone would salvage the readable prefix and import 12 silently. A cell must
    // be a number IN FULL or not at all — same stance as Classic, whose DecimalFormat throws.
    it('returns NaN for a partially-readable cell rather than salvaging its prefix', () => {
      assert.ok(Number.isNaN(parseStatementAmount('12x')));
    });

    // Three separated single digits is not a number under any convention, and salvaging it
    // into 12.3 would import garbage with nothing flagging it.
    it('returns NaN for `1,2,3` rather than netting it into 12.3', () => {
      assert.ok(Number.isNaN(parseStatementAmount('1,2,3')));
    });

    /**
     * The discriminator that keeps the malformed check from being too strict: `1.234.56` IS a
     * number — a grouped thousand with a two-decimal tail — so its last separator becomes the
     * decimal point and the earlier one groups. Without this case, tightening `1,2,3` shut
     * could just as easily have rejected a legitimately grouped amount.
     */
    it('salvages `1.234.56` on purpose — grouped with a decimal tail is a real number', () => {
      assert.equal(parseStatementAmount('1.234.56'), 1234.56);
    });
  });

  describe('signs', () => {
    it('keeps the sign, so the negative-amount rule has something to reject', () => {
      assert.equal(parseStatementAmount('-50'), -50);
      assert.equal(parseStatementAmount('-1.234,56'), -1234.56);
    });

    it('keeps the sign through the thousands rule', () => {
      assert.equal(parseStatementAmount('-1.234'), -1234);
      assert.equal(parseStatementAmount('-1,234'), -1234);
    });
  });
});

describe('parseAmount', () => {
  it('collapses a blank cell to 0', () => {
    assert.equal(parseAmount(''), 0);
    assert.equal(parseAmount(null), 0);
    assert.equal(parseAmount(undefined), 0);
  });

  it('collapses an unparseable cell to 0', () => {
    assert.equal(parseAmount('abc'), 0);
    assert.equal(parseAmount('12x'), 0);
    assert.equal(parseAmount('1,2,3'), 0);
  });

  it('parses the same notations as parseStatementAmount', () => {
    assert.equal(parseAmount('3.500,00'), 3500);
    assert.equal(parseAmount('3,500.00'), 3500);
    assert.equal(parseAmount('1500.50'), 1500.5);
  });

  it('applies the thousands rule too, so the manual grid cannot disagree with the import', () => {
    assert.equal(parseAmount('1.234'), 1234);
    assert.equal(parseAmount('1.500'), 1500);
    assert.equal(parseAmount('0.500'), 0.5);
  });

  it('preserves a negative amount rather than clamping it, so the caller can reject it', () => {
    assert.equal(parseAmount('-50'), -50);
  });
});

describe('isInvalidStatementAmount', () => {
  it('flags a cell that is not a number in full', () => {
    assert.equal(isInvalidStatementAmount('abc'), true);
    assert.equal(isInvalidStatementAmount('ochenta'), true);
    // The contract is all-or-nothing: a cell must be a number IN FULL or not at all. `12x` is
    // therefore a row error, deliberately NOT the 12 that `parseFloat` would salvage from its
    // readable prefix — silently importing a truncated amount is worse than making the user
    // fix the cell, and it is what Classic does too (its DecimalFormat throws on the trailing
    // garbage rather than stopping at it).
    assert.equal(isInvalidStatementAmount('12x'), true, '"12x" is not a number in full');
    assert.equal(isInvalidStatementAmount('1,2,3'), true, '"1,2,3" must not be netted into 12.3');
  });

  it('treats a blank cell as valid', () => {
    assert.equal(isInvalidStatementAmount(''), false);
    assert.equal(isInvalidStatementAmount(null), false);
  });

  it('treats a well-formed amount as valid, negative included', () => {
    assert.equal(isInvalidStatementAmount('3.500,00'), false);
    assert.equal(isInvalidStatementAmount('-50'), false);
  });

  it('treats a grouped amount as valid, with or without a decimal tail', () => {
    assert.equal(isInvalidStatementAmount('1.234'), false);
    assert.equal(isInvalidStatementAmount('1.234.567'), false);
    assert.equal(isInvalidStatementAmount('1.234.56'), false);
  });
});
