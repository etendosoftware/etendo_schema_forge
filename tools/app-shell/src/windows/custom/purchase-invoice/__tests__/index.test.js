import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

// The wrapper bypasses the generated HeaderPage when listing, so the spec's
// labelOverrides do not reach DataTable. The local LABEL_OVERRIDES constant
// is the only thing that renames AD columns in this view — keep these tests
// in sync with artifacts/purchase-invoice/decisions.json → window.labelOverrides.

describe('PurchaseInvoiceWindow — LABEL_OVERRIDES', () => {
  it('relabels POReference as "Nº documento" / "Document No." in the custom list wrapper', () => {
    assert.match(src, /es_ES:\s*\{[\s\S]*?POReference:\s*'Nº documento'/);
    assert.match(src, /en_US:\s*\{[\s\S]*?POReference:\s*'Document No\.'/);
  });

  it('renames OutstandingAmt to "Pendiente de pago" / "Pending Payment"', () => {
    assert.match(src, /es_ES:\s*\{[\s\S]*?OutstandingAmt:\s*'Pendiente de pago'/);
    assert.match(src, /en_US:\s*\{[\s\S]*?OutstandingAmt:\s*'Pending Payment'/);
  });

  // ETP-4303: the AP delivery-status column is a reception status from the buyer's
  // perspective, so it was renamed from "Estado de entrega" to "Estado de recepción".
  it('renames em_etgo_delivery_status to "Estado de recepción" / "Reception Status"', () => {
    assert.match(src, /es_ES:\s*\{[\s\S]*?em_etgo_delivery_status:\s*'Estado de recepción'/);
    assert.match(src, /en_US:\s*\{[\s\S]*?em_etgo_delivery_status:\s*'Reception Status'/);
  });

  it('passes LABEL_OVERRIDES into the ListView', () => {
    assert.match(src, /labelOverrides=\{LABEL_OVERRIDES\}/);
  });
});

describe('PurchaseInvoiceWindow — wiring', () => {
  it('uses the custom PurchaseInvoiceHeaderTable for the list view', () => {
    assert.match(src, /import\s+PurchaseInvoiceHeaderTable\s+from\s+'\.\/PurchaseInvoiceHeaderTable\.jsx'/);
  });

  it('routes to HeaderPage when a recordId is present', () => {
    assert.match(src, /if\s*\(recordId\)/);
  });
});

// ETP-4888 point 5 — Tax SIF quick-fix modal shortcut on invoice lines. Mirrors
// sales-invoice/__tests__/index.test.js's wiring checks. The hook itself is
// fully unit-tested (useTaxSifLineRowActions.vitest.jsx); this file only
// proves the WIRING: the window imports the hook, gates it behind a local
// LINE_TAX_SIF_TRIGGER_ENABLED constant (hand-mirroring
// artifacts/purchase-invoice/decisions.json -> window.lineTaxSifTrigger), and
// forwards both the resulting cellBadges and the modal portal to HeaderPage.
// Updated for the ETP-4888 design-polish round: the hook now returns
// `cellBadges` (not `rowActions`) and is called with `recordId`/
// `windowCategory` (selector-context bugfix).
describe('PurchaseInvoiceWindow — Tax SIF trigger wiring (ETP-4888)', () => {
  it('imports useTaxSifLineRowActions from the shared hook module', () => {
    assert.match(src, /import\s*\{\s*useTaxSifLineRowActions\s*\}\s*from\s*'\.\.\/shared\/useTaxSifLineRowActions\.jsx'/);
  });

  it('declares LINE_TAX_SIF_TRIGGER_ENABLED as a local true constant', () => {
    assert.match(src, /const\s+LINE_TAX_SIF_TRIGGER_ENABLED\s*=\s*true\s*;/);
  });

  // ETP-4576 dropped the `token` option: the hook reads the credential from the
  // active session scheme instead of receiving one from the window.
  it('calls the hook with apiBaseUrl, enabled, recordId and windowCategory: "purchases"', () => {
    assert.match(
      src,
      /useTaxSifLineRowActions\(\{\s*\n?\s*apiBaseUrl,\s*enabled:\s*LINE_TAX_SIF_TRIGGER_ENABLED,\s*recordId,\s*windowCategory:\s*'purchases',?\s*\n?\s*\}\)/,
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
