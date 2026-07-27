import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount } from '../formatAmount.js';

// formatAmount() is a second, independently-maintained currency formatter
// (locale hardcoded to 'en-US') used by 9 consumers across the app — including
// DataTable.jsx / DataTable.cellRenderers.jsx, the generic amount-column
// renderer shared by nearly every window. It must delegate to the canonical
// formatCurrency() instead of maintaining its own Intl logic, per ETP-4314's
// centralization principle.

describe('formatAmount', () => {
  it('uses the es-ES locale (comma decimal), never en-US (dot decimal)', () => {
    assert.equal(formatAmount(1234.5, 'EUR'), '1.234,50 €');
    assert.notEqual(formatAmount(1234.5, 'EUR'), '1,234.50 €');
  });

  it('groups thousands in the 1000-9999 range', () => {
    assert.equal(formatAmount(1355.2, 'EUR'), '1.355,20 €');
  });

  it('resolves the real symbol for a non-EUR currency (USD), matching formatCurrency\'s placement (symbol after amount)', () => {
    assert.equal(formatAmount(304.92, 'USD'), '304,92 $');
  });

  it('falls back to plain es-ES formatting (no symbol) when no currency code is given', () => {
    assert.equal(formatAmount(1234.5, undefined), '1.234,50');
  });

  it('returns an em dash for null/undefined, matching formatCurrency\'s contract', () => {
    assert.equal(formatAmount(null, 'EUR'), '—');
    assert.equal(formatAmount(undefined, 'EUR'), '—');
  });

  it('keeps the sign before the amount for negative values (symbol still after)', () => {
    assert.equal(formatAmount(-99.9, 'EUR'), '-99,90 €');
  });
});
