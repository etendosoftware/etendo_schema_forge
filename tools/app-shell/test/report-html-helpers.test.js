import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

// This is the canonical, real, importable module that both `report-api.js`'s
// HTML-preview render path uses TODAY, and that the jsreport PDF/XLSX path will
// serialize (via fn.toString()) once the centralization refactor lands. It must
// use the same es-ES locale + explicit grouping as the app-shell's formatCurrency() —
// no currency symbol here (printed/on-screen reports intentionally omit it, per
// scope decision), just correct thousands/decimal separators.

describe('report-html-helpers — formatCurrency', () => {
  it('uses the es-ES locale (comma decimal), never en-US (dot decimal)', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(1232), '1.232,00');
    assert.notEqual(formatCurrency(1232), '1,232.00');
  });

  it('groups thousands in the 1000-9999 range (silently dropped without explicit useGrouping)', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(1355.2), '1.355,20');
  });

  it('formats null/undefined as an empty string (unchanged contract)', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(null), '');
    assert.equal(formatCurrency(undefined), '');
  });
});

// ETP-4898: summing floats (e.g. a report's "Total" row via sumField) routinely
// leaves a residual like -2.9103830456733704e-11 instead of exactly 0 —
// genuinely negative pre-rounding, but rounds to zero at 2 decimals.
// Intl.NumberFormat keeps the sign of the pre-rounding value, so without the
// guard it renders "-0,00" for what must display as "0,00".
describe('report-html-helpers — formatCurrency — negative-zero guard (ETP-4898)', () => {
  it('does not render "-0,00" for a tiny float-sum residual that rounds to zero', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(-2.9103830456733704e-11), '0,00');
  });

  it('does not render "-0,00" for a genuine negative zero (-0)', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(-0), '0,00');
  });

  it('still renders "0,00" for a plain positive zero (no regression)', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(0), '0,00');
  });

  it('reproduces the real Trial Balance opening_balance column summing to (near) zero', () => {
    const { formatCurrency, sumField } = createReportHelpers();
    const rows = [
      214979.72, -327.50, 0.00, 5267.80, 40250.49, -1769.88,
      -226661.91, 0.00, -28274.22, -8428.00, 0.00, 4963.50,
    ].map((amount) => ({ amount }));
    const total = sumField(rows, 'amount');
    assert.equal(formatCurrency(total), '0,00');
  });

  it('still shows the sign for a genuinely negative value (fix must not hide real negatives)', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(-186708.62), '-186.708,62');
  });

  it('still shows the sign for a small negative value that rounds to a non-zero display', () => {
    const { formatCurrency } = createReportHelpers();
    assert.equal(formatCurrency(-0.006), '-0,01');
  });
});

describe('report-html-helpers — formatNumber', () => {
  it('uses the es-ES locale (comma decimal), never en-US (dot decimal)', () => {
    const { formatNumber } = createReportHelpers();
    assert.equal(formatNumber(1232), '1.232');
    assert.notEqual(formatNumber(1232), '1,232');
  });

  it('respects a custom numberFormat option (e.g. 2 fixed decimals for tax-report percentages)', () => {
    const { formatNumber } = createReportHelpers({ numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2 } });
    assert.equal(formatNumber(21), '21,00');
  });
});
