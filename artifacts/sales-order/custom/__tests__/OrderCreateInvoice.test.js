import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OrderCreateInvoice.jsx'), 'utf8');

describe('OrderCreateInvoice', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function OrderCreateInvoice/);
  });

  it('accepts data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl/);
  });

  it('renders confirm flow only for draft orders (status DR)', () => {
    assert.match(src, /const isDraft\s*=\s*status\s*===\s*'DR'/);
    assert.match(src, /\{isDraft && showConfirm && createPortal\(/);
  });

  it('uses createPortal for modal rendering', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('ConfirmModal exposes shipment + invoice optional checkboxes', () => {
    assert.match(src, /<SoCheckboxCard/);
    assert.match(src, /soCreateShipmentTitle/);
    assert.match(src, /soCreateInvoiceTitle/);
  });

  it('confirms order via documentAction endpoint with docAction=CO', () => {
    assert.match(src, /action\/documentAction/);
    assert.match(src, /docAction:\s*['"]CO['"]/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('creates shipment via createShipment action', () => {
    assert.match(src, /action\/createShipment/);
  });

  it('creates draft invoice via createDraftInvoice action', () => {
    assert.match(src, /action\/createDraftInvoice/);
  });

  it('fetches all linked invoices via listInvoices action', () => {
    assert.match(src, /listInvoices/);
    assert.match(src, /action\/listInvoices/);
  });

  it('only shows completed-order UI when document is completed', () => {
    assert.match(src, /isCompleted/);
    assert.match(src, /documentStatus\s*===\s*'CO'/);
  });

  it('shows DraftChip pills for pending draft documents', () => {
    assert.match(src, /DraftChip/);
    assert.match(src, /shipmentsDraft/);
    assert.match(src, /invoiceDraft/);
  });

  it('calculates pending quantity and amount', () => {
    assert.match(src, /qtyOrdered/);
    assert.match(src, /qtyDelivered/);
    assert.match(src, /qtyPending/);
    assert.match(src, /totalPending/);
  });

  it('exposes draft-aware Gestionar button via i18n keys', () => {
    assert.match(src, /needsShip/);
    assert.match(src, /needsInvoice/);
    assert.match(src, /shipmentsDraft\.length === 0/);
    assert.match(src, /!invoiceDraft/);
    assert.match(src, /soManageShipmentAndInvoice/);
    assert.match(src, /soManageShipment/);
    assert.match(src, /soManageInvoice/);
  });

  describe('ConfirmModal total-discount preview (ETP-4006)', () => {
    it('applies the total-discount factor only while the order is still in DR', () => {
      assert.match(src, /const discountPct\s*=\s*Number\(d\.etgoTotalDiscount \?\? 0\)/);
      assert.match(src, /const isPreCompletion\s*=\s*d\.documentStatus === 'DR'/);
      assert.match(src, /const discountFactor\s*=\s*\(isPreCompletion && discountPct > 0\) \? \(1 - discountPct \/ 100\) : 1/);
    });

    it('computes grandTotal as round(net × factor) + round(tax × factor), not round(gross × factor) (ETP-4017)', () => {
      // Anti-double-rounding rule: see DocumentTotalsPanel / documentTotals.js.
      // The displayed total must equal sum of displayed components so it agrees
      // with the order's right panel and with AEAT-compliant printed invoices.
      assert.match(src, /const round2\s*=\s*\(n\) => Math\.round\(\(n \+ Number\.EPSILON\) \* 100\) \/ 100/);
      assert.match(src, /const grossBase\s*=\s*Number\(d\.grandTotalAmount\) \|\| 0/);
      assert.match(src, /const netBase\s*=\s*Number\(d\.summedLineAmount \?\? d\.totalLines \?\? grossBase\) \|\| 0/);
      assert.match(src, /const totalLines\s*=\s*round2\(netBase \* discountFactor\)/);
      assert.match(src, /const grandTotal\s*=\s*totalLines \+ round2\(\(grossBase - netBase\) \* discountFactor\)/);
    });
  });

  it('dispatches document-created event after creating a doc', () => {
    assert.match(src, /sales-order:document-created/);
    assert.match(src, /dispatchEvent/);
  });

  it('navigates to shipment and invoice detail after creation', () => {
    assert.match(src, /\/goods-shipment\//);
    assert.match(src, /\/sales-invoice\//);
  });

  it('opens actions modal scrolled to a specific section via actionsScroll', () => {
    assert.match(src, /actionsScroll/);
    assert.match(src, /setActionsScroll\(/);
  });

  // ── Idempotent retry coverage ──────────────────────────────────────────────

  describe('ConfirmModal — idempotent retry', () => {
    it('tracks per-step persisted state in component', () => {
      assert.match(src, /\[orderConfirmed,\s*setOrderConfirmed\]\s*=\s*useState\(false\)/);
      assert.match(src, /\[shipmentResult,\s*setShipmentResult\]\s*=\s*useState\(null\)/);
      assert.match(src, /\[invoiceResult,\s*setInvoiceResult\]\s*=\s*useState\(null\)/);
    });

    it('skips order confirmation when orderConfirmed is already true', () => {
      assert.match(src, /if\s*\(!orderConfirmed\)\s*\{[\s\S]*?action\/documentAction[\s\S]*?setOrderConfirmed\(true\)/);
    });

    it('skips createShipment when shipmentResult is already populated', () => {
      assert.match(src, /if\s*\(createShipment\s*&&\s*!shipmentResult\)/);
    });

    it('skips createDraftInvoice when invoiceResult is already populated', () => {
      assert.match(src, /if\s*\(createInvoice\s*&&\s*!invoiceResult\)/);
    });

    it('persists each step result in state right after success', () => {
      assert.match(src, /setShipmentResult\(currentShipment\)/);
      assert.match(src, /setInvoiceResult\(currentInvoice\)/);
    });

    it('falls back to persisted state when assembling onConfirmed payload', () => {
      assert.match(src, /shipment:\s*currentShipment\s*\?\?\s*shipmentResult/);
      assert.match(src, /invoice:\s*currentInvoice\s*\?\?\s*invoiceResult/);
    });

    it('locks the shipment checkbox once the shipment was created', () => {
      assert.match(src, /checked=\{createShipment\s*\|\|\s*Boolean\(shipmentResult\)\}/);
      assert.match(src, /onChange=\{\(\)\s*=>\s*!shipmentResult\s*&&\s*setCreateShipment/);
      assert.match(src, /disabled=\{Boolean\(shipmentResult\)\}/);
    });

    it('locks the invoice checkbox once the invoice was created', () => {
      assert.match(src, /checked=\{createInvoice\s*\|\|\s*Boolean\(invoiceResult\)\}/);
      assert.match(src, /onChange=\{\(\)\s*=>\s*!invoiceResult\s*&&\s*setCreateInvoice/);
      assert.match(src, /disabled=\{Boolean\(invoiceResult\)\}/);
    });

    it('shows soAlreadyCreated label on the locked card subtitle', () => {
      assert.match(src, /shipmentResult\s*\?\s*ui\('soAlreadyCreated'\)/);
      assert.match(src, /invoiceResult\s*\?\s*ui\('soAlreadyCreated'\)/);
    });

    it('runs shipment and invoice steps independently (each in its own try/catch)', () => {
      // Step 2 has its own try/catch — failure does NOT throw out of handleConfirm
      assert.match(
        src,
        /if\s*\(createShipment\s*&&\s*!shipmentResult\)\s*\{\s*try\s*\{[\s\S]*?action\/createShipment[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?errors\.push/,
      );
      // Step 3 has its own try/catch — runs even if step 2 failed
      assert.match(
        src,
        /if\s*\(createInvoice\s*&&\s*!invoiceResult\)\s*\{\s*try\s*\{[\s\S]*?action\/createDraftInvoice[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?errors\.push/,
      );
    });

    it('aggregates errors from steps 2 and 3 instead of stopping on the first', () => {
      assert.match(src, /const errors\s*=\s*\[\]/);
      assert.match(src, /if\s*\(errors\.length\s*>\s*0\)\s*\{[\s\S]*?setError\(errors\.join\('\\n'\)\)/);
    });

    it('aborts before steps 2 and 3 only when step 1 (documentAction) fails', () => {
      // Step 1 still has a try/catch with early return — without a confirmed
      // order the rest of the flow makes no sense
      assert.match(
        src,
        /if\s*\(!orderConfirmed\)\s*\{\s*try\s*\{[\s\S]*?action\/documentAction[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?setError[\s\S]*?return;\s*\}/,
      );
    });

    it('renders the error region with whiteSpace: pre-line so multiple errors keep their newline', () => {
      assert.match(src, /whiteSpace:\s*'pre-line'/);
    });

    it('routes close-after-partial-success through onConfirmed so the page reloads on the result modal', () => {
      // handleClose forwards to onConfirmed if any work was done; otherwise plain onClose
      assert.match(
        src,
        /const handleClose\s*=\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(orderConfirmed\s*\|\|\s*shipmentResult\s*\|\|\s*invoiceResult\)[\s\S]*?onConfirmed\(\{[\s\S]*?shipment:\s*shipmentResult[\s\S]*?invoice:\s*invoiceResult[\s\S]*?\}\)[\s\S]*?return;[\s\S]*?\}[\s\S]*?onClose\(\);/,
      );
      // Cancel button + X button + overlay click all use handleClose, not onClose directly
      assert.match(src, /<div onClick=\{handleClose\} style=\{overlayStyle\}>/);
      assert.match(src, /onClick=\{handleClose\} style=\{closeBtn\}/);
      assert.match(src, /onClick=\{handleClose\} disabled=\{loading\}/);
    });
  });

  describe('SoCheckboxCard — disabled (already-done) treatment', () => {
    it('accepts a disabled prop', () => {
      assert.match(src, /function SoCheckboxCard\(\{[^}]*disabled[^}]*\}\)/);
    });

    it('blocks onClick when disabled', () => {
      assert.match(src, /onClick=\{disabled\s*\?\s*undefined\s*:\s*onChange\}/);
    });

    it('switches border and background to a green/done palette when disabled', () => {
      assert.match(src, /disabled\s*\?\s*'2px solid #10B981'/);
      assert.match(src, /disabled\s*\?\s*'#ECFDF5'/);
      assert.match(src, /disabled\s*\?\s*'#10B981'/);
    });

    it('renders the checkmark for both checked and disabled states', () => {
      assert.match(src, /\(checked\s*\|\|\s*disabled\)\s*&&\s*\(/);
    });
  });

  // ETP-4312: the modal must DERIVE the view label from each doc's type. Passing
  // a hardcoded primary={ui('soViewInvoice')} would force "Ver factura" on a
  // shipment-only result. The arrow now comes from the modal's SVG, not the label.
  describe('ConfirmResultModal primary label (ETP-4312 regression)', () => {
    it('does not force a hardcoded soViewInvoice primary label', () => {
      assert.doesNotMatch(src, /primary=\{ui\('soViewInvoice'\)\}/);
    });

    it('does not pass any hardcoded primary view label to the modal', () => {
      assert.doesNotMatch(src, /primary=\{ui\('(soViewInvoice|poViewInvoice|soViewShipment|poViewReceipt|sqViewOrder)'\)\}/);
    });
  });
});
