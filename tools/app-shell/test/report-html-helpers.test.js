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
