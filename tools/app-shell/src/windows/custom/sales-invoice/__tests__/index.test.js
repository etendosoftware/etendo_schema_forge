import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerLabelOverrideTests, OUTSTANDING_AMT_CASE } from '../../shared/__tests__/testUtils/labelOverrideAssertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('SalesInvoiceWindow — LABEL_OVERRIDES', () => {
  registerLabelOverrideTests(assert, src, [
    OUTSTANDING_AMT_CASE,
    { column: 'em_etgo_delivery_status', labels: { es_ES: 'Estado de entrega', en_US: 'Delivery Status' } },
  ]);

  it('passes LABEL_OVERRIDES into the ListView', () => {
    assert.match(src, /labelOverrides=\{LABEL_OVERRIDES\}/);
  });
});

describe('SalesInvoiceWindow — wiring', () => {
  it('uses the custom InvoiceHeaderTable for the list view', () => {
    assert.match(src, /import\s+InvoiceHeaderTable\s+from\s+'@generated\/sales-invoice\/custom\/InvoiceHeaderTable\.jsx'/);
  });

  it('routes to HeaderPage when a recordId is present', () => {
    assert.match(src, /if\s*\(recordId\)/);
  });

  it('does not hardcode hidePrint on ListView (ETP-4728 — print restored)', () => {
    assert.doesNotMatch(src, /hidePrint/,
      'the bulk "Print (N)" grid button must not be hidden via listViewOptions — ' +
      'ETP-4728 restored it for sales-invoice, mirroring sales-order (ETP-4729)');
  });
});

// ETP-4888 point 5 — Tax SIF quick-fix modal shortcut on invoice lines. The
// hook itself is fully unit-tested (useTaxSifLineRowActions.vitest.jsx); this
// file only proves the WIRING: the window imports the hook, gates it behind a
// local LINE_TAX_SIF_TRIGGER_ENABLED constant (hand-mirroring
// artifacts/sales-invoice/decisions.json -> window.lineTaxSifTrigger, since
// DetailView's lineCellBadges prop has no generate-frontend.js wiring — see the
// constant's own comment in index.jsx), and forwards both the resulting
// cellBadges and the modal portal to HeaderPage. Updated for the ETP-4888
// design-polish round: the hook now returns `cellBadges` (not `rowActions`)
// and is called with `recordId`/`windowCategory` (selector-context bugfix).
describe('SalesInvoiceWindow — Tax SIF trigger wiring (ETP-4888)', () => {
  it('imports useTaxSifLineRowActions from the shared hook module', () => {
    assert.match(src, /import\s*\{\s*useTaxSifLineRowActions\s*\}\s*from\s*'\.\.\/shared\/useTaxSifLineRowActions\.jsx'/);
  });

  it('declares LINE_TAX_SIF_TRIGGER_ENABLED as a local true constant', () => {
    assert.match(src, /const\s+LINE_TAX_SIF_TRIGGER_ENABLED\s*=\s*true\s*;/);
  });

  it('calls the hook with apiBaseUrl, token, enabled, recordId, windowCategory: "sales" and specName: "sales-invoice"', () => {
    assert.match(
      src,
      /useTaxSifLineRowActions\(\{\s*\n?\s*apiBaseUrl,\s*token,\s*enabled:\s*LINE_TAX_SIF_TRIGGER_ENABLED,\s*recordId,\s*windowCategory:\s*'sales',\s*specName:\s*'sales-invoice',?\s*\n?\s*\}\)/,
    );
  });

  it('destructures cellBadges/modal as taxSifCellBadges/taxSifModal', () => {
    assert.match(
      src,
      /const\s*\{\s*cellBadges:\s*taxSifCellBadges,\s*modal:\s*taxSifModal\s*\}\s*=\s*useTaxSifLineRowActions/,
    );
  });

  it('forwards taxSifCellBadges to HeaderPage as lineCellBadges', () => {
    assert.match(src, /lineCellBadges=\{taxSifCellBadges\}/);
  });

  it('renders the taxSifModal portal alongside contactPortal', () => {
    assert.match(src, /\{contactPortal\}\s*\n\s*\{taxSifModal\}/);
  });
});
