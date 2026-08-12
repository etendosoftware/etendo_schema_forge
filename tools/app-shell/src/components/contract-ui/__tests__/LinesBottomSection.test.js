import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'LinesBottomSection.jsx'), 'utf8');

describe('LinesBottomSection', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function LinesBottomSection/);
  });

  it('accepts all expected props', () => {
    for (const prop of [
      'recordId', 'data', 'token', 'apiBaseUrl', 'api',
      'notesField', 'onFieldChange', 'notesFocused', 'setNotesFocused',
      'lines', 'pendingLine', 'editingLine', 'lineConfig',
      'totalDiscountPct', 'onTotalDiscountChange',
      'relatedDocuments', 'showTotals', 'notesExtra',
    ]) {
      assert.match(src, new RegExp(`\\b${prop}\\b`), `missing prop: ${prop}`);
    }
  });

  it('showTotals defaults to true', () => {
    assert.match(src, /showTotals\s*=\s*true/);
  });

  it('renders DocumentTotalsPanel when showTotals is true', () => {
    assert.match(src, /DocumentTotalsPanel/);
    assert.match(src, /showTotals\s*&&/);
  });

  it('derives isReadOnly from documentStatus !== DR', () => {
    assert.match(src, /documentStatus\s*!==\s*'DR'/);
  });

  it('renders RelatedDocumentsComponent when provided', () => {
    assert.match(src, /RelatedDocumentsComponent\s*&&/);
    assert.match(src, /<RelatedDocumentsComponent/);
  });

  it('renders the notesField area when notesField is truthy', () => {
    assert.match(src, /notesField\s*&&/);
    assert.match(src, /data\?\.\[notesField\]/);
  });

  it('uses useUI for the docs and notes section labels', () => {
    assert.match(src, /useUI\(\)/);
    assert.match(src, /ui\('docs'\)/);
    assert.match(src, /ui\('notes'\)/);
  });

  it('passes editingLine and pendingLine to DocumentTotalsPanel for live totals', () => {
    assert.match(src, /pendingLine=\{pendingLine[^}]*\}/);
    assert.match(src, /editingLine=\{editingLine[^}]*\}/);
  });

  it('shows notes as a textarea when notesFocused, plain text otherwise', () => {
    assert.match(src, /<textarea/);
    assert.match(src, /notesFocused\s*\?/);
  });

  it('renders NotesExtraComponent slot when provided', () => {
    assert.match(src, /NotesExtraComponent\s*&&/);
    assert.match(src, /<NotesExtraComponent/);
  });

  it('imports DocumentTotalsPanel from the local module', () => {
    assert.match(src, /import DocumentTotalsPanel from '\.\/DocumentTotalsPanel\.jsx'/);
  });

  it('ETP-4777: derives persistedTotals from data.grandTotalAmount/totalLines and forwards it to DocumentTotalsPanel', () => {
    assert.match(src, /data\?\.grandTotalAmount/);
    assert.match(src, /persistedTotals=\{persistedTotals\}/);
  });

  it('ETP-4777: net subtotal prefers data.summedLineAmount, falling back to data.totalLines', () => {
    // The NEO header response exposes the persisted net subtotal as
    // `summedLineAmount` (confirmed live: purchase-order header GET returns
    // summedLineAmount=2750, no totalLines field at all) — matches the same
    // fallback pattern already proven in useInvoicePdf.js/useQuotationPdf.js.
    assert.match(src, /data\?\.summedLineAmount\s*\?\?\s*data\?\.totalLines/);
  });

  it('ETP-4777: derives raw vs discounted net subtotal from isReadOnly, not from the (unreliable) line-based discount check', () => {
    // Two regressions found during manual verification with a real Draft→
    // Complete transition:
    // (1) Pre-Complete, grandTotalAmount is GET-time-compensated by the
    //     discount but summedLineAmount/totalLines is NOT — deriving taxAmt
    //     as a plain grandTotal-netAmount produces a negative "tax".
    // (2) Post-Complete, summedLineAmount BECOMES net-of-discount (the
    //     ETGO_DTO line materialised), but resolveTotalDiscountPct cannot see
    //     that (the line is filtered out of `lines` server-side) and keeps
    //     reporting the full pct — so naively re-applying the discount
    //     factor double-counts it (verified live: Subtotal 54,67 + Impuesto
    //     37,72 ≠ Total 99,23). The fix branches on `isReadOnly`
    //     (documentStatus) to know which of raw/discounted the persisted
    //     summedLineAmount already IS, and derives the other one from it.
    assert.match(src, /discountFactor/);
    assert.match(src, /if\s*\(isReadOnly\)\s*\{\s*rawNetSubtotal\s*=\s*persistedNetSubtotal\s*\/\s*discountFactor/);
    assert.match(src, /discountedNetSubtotal\s*=\s*persistedNetSubtotal\s*\*\s*discountFactor/);
  });

  it('totals column uses a soft minHeight floor, not a rigid pixel clamp', () => {
    // Previously the panel was locked at height/minHeight/maxHeight: 241 which
    // acted as a floor on the whole bottom section and crushed the lines table
    // on 1366×768. The fix is a single `minHeight: 200` so the panel keeps a
    // stable visual rhythm but is free to grow / coexist with a shorter
    // viewport. Extract just the live `style={{ ... }}` block of the totals
    // column so historical comment text (which still names the old clamp)
    // doesn't trip the assertion.
    const styleMatch = src.match(/w-\[520px\][^>]*style=\{\{([^}]+)\}\}/);
    assert.ok(styleMatch, 'totals column with w-[520px] + style={{...}} not found');
    const inlineStyle = styleMatch[1];
    assert.match(inlineStyle, /minHeight:\s*200/, 'totals wrapper must declare minHeight: 200');
    assert.doesNotMatch(inlineStyle, /(^|[^a-zA-Z])height:\s*241/, 'rigid `height: 241` must not return on the live style');
    assert.doesNotMatch(inlineStyle, /maxHeight:\s*241/, 'rigid `maxHeight: 241` must not return on the live style');
  });
});
