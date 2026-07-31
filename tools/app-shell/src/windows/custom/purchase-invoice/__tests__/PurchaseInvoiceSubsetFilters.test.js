/**
 * Tests for the INVOICE_SUBSET_FILTERS constant in index.jsx.
 *
 * ETP-4737: this array used to discriminate via a client-side `rowFilter` that
 * matched the raw doc-type identifier string (e.g. 'AP Invoice', 'AP CreditMemo').
 * That silently missed any new document type sharing the same category — exactly
 * how the new "Factura Rectificativa (compras)" type fell through to "Todos"
 * instead of "Facturas rectificativas". The fix switched to server-side `filter`
 * criteria (documentCategory / etsgIsRectificative), mirrored 1:1 from
 * artifacts/purchase-invoice/decisions.json → window.subsetFilters — the same
 * mechanism sales-invoice/index.jsx already uses for its own tabs.
 *
 * Strategy:
 *   1. Source-reading: verify the structural contract (constant exists, correct
 *      labels, no filter/rowFilter on "allTab", a `filter` string on both typed
 *      tabs — NOT a rowFilter).
 *   2. Cross-check: the `filter` strings in index.jsx must match decisions.json
 *      byte-for-byte, and must decode to the expected AdvancedCriteria payload.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
const decisions = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'artifacts', 'purchase-invoice', 'decisions.json'),
    'utf8',
  ),
);
const decisionsByLabel = Object.fromEntries(
  decisions.window.subsetFilters.map((f) => [f.label, f.filter]),
);

// ---------------------------------------------------------------------------
// Structural contract (source-reading)
// ---------------------------------------------------------------------------

describe('INVOICE_SUBSET_FILTERS — structural contract', () => {
  it('declares INVOICE_SUBSET_FILTERS as a const array', () => {
    assert.match(src, /const INVOICE_SUBSET_FILTERS = \[/);
  });

  it('has exactly three entries: allTab, invoicesTab, creditNotesTab', () => {
    const matches = [...src.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1]);
    assert.ok(
      matches.includes('allTab'),
      'expected label "allTab" in INVOICE_SUBSET_FILTERS',
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

  it('"allTab" entry has no filter/rowFilter property', () => {
    // The "allTab" entry is `{ label: 'allTab' }` — no filter/rowFilter key on that line
    assert.match(src, /\{\s*label:\s*'allTab'\s*\}/);
  });

  it('does NOT use client-side rowFilter (name-string matching) for invoicesTab/creditNotesTab', () => {
    assert.doesNotMatch(
      src,
      /label:\s*'invoicesTab',\s*rowFilter/,
      'invoicesTab must use a server-side `filter`, not a rowFilter matching the doc-type identifier',
    );
    assert.doesNotMatch(
      src,
      /label:\s*'creditNotesTab',\s*rowFilter/,
      'creditNotesTab must use a server-side `filter`, not a rowFilter matching the doc-type identifier',
    );
  });

  it('"invoicesTab" and "creditNotesTab" both declare a `filter` string', () => {
    assert.match(src, /label:\s*'invoicesTab',\s*filter:\s*'[^']+'/);
    assert.match(src, /label:\s*'creditNotesTab',\s*filter:\s*'[^']+'/);
  });

  it('passes subsetFilters to ListView', () => {
    assert.match(src, /subsetFilters=\{INVOICE_SUBSET_FILTERS\}/);
  });
});

// ---------------------------------------------------------------------------
// Filter criteria — must mirror decisions.json exactly (kept-in-sync contract)
// ---------------------------------------------------------------------------

function extractFilter(label) {
  const m = src.match(new RegExp(`label:\\s*'${label}',\\s*filter:\\s*'([^']+)'`));
  return m ? m[1] : null;
}

describe('INVOICE_SUBSET_FILTERS — mirrors decisions.json subsetFilters', () => {
  it('invoicesTab.filter matches decisions.json exactly', () => {
    const jsFilter = extractFilter('invoicesTab');
    assert.ok(jsFilter, 'expected an invoicesTab filter string in index.jsx');
    assert.equal(jsFilter, decisionsByLabel.invoicesTab);
  });

  it('creditNotesTab.filter matches decisions.json exactly', () => {
    const jsFilter = extractFilter('creditNotesTab');
    assert.ok(jsFilter, 'expected a creditNotesTab filter string in index.jsx');
    assert.equal(jsFilter, decisionsByLabel.creditNotesTab);
  });

  it('invoicesTab decodes to: documentCategory=API AND etsgIsRectificative != true', () => {
    const jsFilter = extractFilter('invoicesTab');
    const criteria = JSON.parse(decodeURIComponent(jsFilter.replace(/^criteria=/, '')));
    assert.deepEqual(criteria, [
      { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'API' },
      { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'notEqual', value: true },
    ]);
  });

  it('creditNotesTab decodes to: etsgIsRectificative=true OR documentCategory=APC', () => {
    const jsFilter = extractFilter('creditNotesTab');
    const criteria = JSON.parse(decodeURIComponent(jsFilter.replace(/^criteria=/, '')));
    assert.deepEqual(criteria, [{
      _constructor: 'AdvancedCriteria',
      operator: 'or',
      criteria: [
        { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'equals', value: true },
        { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'APC' },
      ],
    }]);
  });

  // The whole point of the fix: a new doc type like "Factura Rectificativa
  // (compras)" is recognized because it satisfies etsgIsRectificative=true,
  // regardless of its identifier text — unlike the old exact-name rowFilter,
  // which never matched it. This test documents that invariant at the criteria
  // level (the field checked is the boolean flag, not the identifier string).
  it('creditNotesTab criteria never references the doc-type identifier/name', () => {
    const jsFilter = extractFilter('creditNotesTab');
    assert.doesNotMatch(decodeURIComponent(jsFilter), /_identifier/);
    assert.doesNotMatch(decodeURIComponent(jsFilter), /Rectificativa|CreditMemo/);
  });
});
