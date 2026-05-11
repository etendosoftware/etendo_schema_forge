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

  it('renames em_etgo_delivery_status to "Estado de entrega" / "Delivery Status"', () => {
    assert.match(src, /es_ES:\s*\{[\s\S]*?em_etgo_delivery_status:\s*'Estado de entrega'/);
    assert.match(src, /en_US:\s*\{[\s\S]*?em_etgo_delivery_status:\s*'Delivery Status'/);
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
