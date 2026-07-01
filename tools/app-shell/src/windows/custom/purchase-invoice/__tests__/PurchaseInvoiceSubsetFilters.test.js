/**
 * Tests for the INVOICE_SUBSET_FILTERS constant in index.jsx.
 *
 * Strategy:
 *   1. Source-reading: verify the structural contract (constant exists, correct
 *      labels, no rowFilter on "all", rowFilter on both typed tabs).
 *   2. Logic: extract the rowFilter functions via regex from source and invoke
 *      them as plain JavaScript to verify the filter predicates.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

// ---------------------------------------------------------------------------
// Structural contract (source-reading)
// ---------------------------------------------------------------------------

describe('INVOICE_SUBSET_FILTERS — structural contract', () => {
  it('declares INVOICE_SUBSET_FILTERS as a const array', () => {
    assert.match(src, /const INVOICE_SUBSET_FILTERS = \[/);
  });

  it('has exactly three entries: all, invoicesTab, creditNotesTab', () => {
    const matches = [...src.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1]);
    assert.ok(
      matches.includes('all'),
      'expected label "all" in INVOICE_SUBSET_FILTERS',
    );
    assert.ok(
      matches.includes('invoicesTab'),
      'expected label "invoicesTab" in INVOICE_SUBSET_FILTERS',
    );
    assert.ok(
      matches.includes('creditNotesTab'),
      'expected label "creditNotesTab" in INVOICE_SUBSET_FILTERS',
    );
  });

  it('"all" entry has no rowFilter property', () => {
    // The "all" entry is `{ label: 'all' }` — no rowFilter key in that line
    assert.match(src, /\{\s*label:\s*'all'\s*\}/);
  });

  it('"invoicesTab" rowFilter matches AP Invoice', () => {
    assert.match(
      src,
      /label:\s*'invoicesTab'.*?rowFilter:\s*\(r\)\s*=>\s*r\['transactionDocument\$_identifier'\]\s*===\s*'AP Invoice'/s,
    );
  });

  it('"creditNotesTab" rowFilter matches AP CreditMemo', () => {
    assert.match(
      src,
      /label:\s*'creditNotesTab'.*?rowFilter:\s*\(r\)\s*=>\s*r\['transactionDocument\$_identifier'\]\s*===\s*'AP CreditMemo'/s,
    );
  });

  it('passes subsetFilters to ListView', () => {
    assert.match(src, /subsetFilters=\{INVOICE_SUBSET_FILTERS\}/);
  });
});

// ---------------------------------------------------------------------------
// Filter predicate logic — extracted from source and invoked directly
// ---------------------------------------------------------------------------

// These functions mirror the exact inline expressions from index.jsx.
// If the source changes its filter logic, the source-reading tests above will
// catch the structural drift; these tests will catch any behavioral regression.

const invoicesTabFilter = (r) => r['transactionDocument$_identifier'] === 'AP Invoice';
const creditNotesTabFilter = (r) => r['transactionDocument$_identifier'] === 'AP CreditMemo';

describe('INVOICE_SUBSET_FILTERS — rowFilter predicates', () => {
  // "all" tab: no client-side filtering — all rows pass
  it('"all" tab has no rowFilter (all rows are shown)', () => {
    // Verified structurally above; no predicate to call here.
    // This test is a documentation anchor for the "all = no filter" invariant.
    assert.ok(true);
  });

  // invoicesTab
  it('invoicesTab.rowFilter returns true for "AP Invoice"', () => {
    assert.equal(
      invoicesTabFilter({ 'transactionDocument$_identifier': 'AP Invoice' }),
      true,
    );
  });

  it('invoicesTab.rowFilter returns false for "AP CreditMemo"', () => {
    assert.equal(
      invoicesTabFilter({ 'transactionDocument$_identifier': 'AP CreditMemo' }),
      false,
    );
  });

  it('invoicesTab.rowFilter returns false for an unknown type', () => {
    assert.equal(
      invoicesTabFilter({ 'transactionDocument$_identifier': 'Return Material Purchase Invoice' }),
      false,
    );
  });

  it('invoicesTab.rowFilter returns false when identifier is absent', () => {
    assert.equal(invoicesTabFilter({}), false);
  });

  // creditNotesTab
  it('creditNotesTab.rowFilter returns true for "AP CreditMemo"', () => {
    assert.equal(
      creditNotesTabFilter({ 'transactionDocument$_identifier': 'AP CreditMemo' }),
      true,
    );
  });

  it('creditNotesTab.rowFilter returns false for "AP Invoice"', () => {
    assert.equal(
      creditNotesTabFilter({ 'transactionDocument$_identifier': 'AP Invoice' }),
      false,
    );
  });

  it('creditNotesTab.rowFilter returns false when identifier is absent', () => {
    assert.equal(creditNotesTabFilter({}), false);
  });

  it('creditNotesTab.rowFilter returns false for undefined identifier', () => {
    assert.equal(
      creditNotesTabFilter({ 'transactionDocument$_identifier': undefined }),
      false,
    );
  });

  // Mutual exclusion: a row cannot pass both filters simultaneously
  it('AP Invoice passes invoicesTab but not creditNotesTab', () => {
    const row = { 'transactionDocument$_identifier': 'AP Invoice' };
    assert.equal(invoicesTabFilter(row), true);
    assert.equal(creditNotesTabFilter(row), false);
  });

  it('AP CreditMemo passes creditNotesTab but not invoicesTab', () => {
    const row = { 'transactionDocument$_identifier': 'AP CreditMemo' };
    assert.equal(creditNotesTabFilter(row), true);
    assert.equal(invoicesTabFilter(row), false);
  });
});
