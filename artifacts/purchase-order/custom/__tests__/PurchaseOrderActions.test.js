import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseOrderActions.jsx'), 'utf8');

describe('PurchaseOrderActions', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function PurchaseOrderActions/);
  });

  it('accepts data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl/);
  });

  it('distinguishes draft vs completed orders by documentStatus', () => {
    assert.match(src, /const isDraft\s*=\s*status\s*===\s*'DR'/);
    assert.match(src, /const isCompleted\s*=\s*status\s*===\s*'CO'/);
  });

  it('listens for purchase-order:open-confirm-modal events', () => {
    assert.match(src, /purchase-order:open-confirm-modal/);
    assert.match(src, /addEventListener\('purchase-order:open-confirm-modal'/);
  });

  it('listens for purchase-order:open-actions-modal events', () => {
    assert.match(src, /purchase-order:open-actions-modal/);
  });

  it('uses createPortal for modal rendering', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('renders ConfirmModal only when draft and showConfirm is true', () => {
    assert.match(src, /\{isDraft && showConfirm && createPortal\(/);
    assert.match(src, /<ConfirmModal/);
  });

  it('confirms order via documentAction endpoint with docAction=CO', () => {
    assert.match(src, /action\/documentAction/);
    assert.match(src, /docAction:\s*['"]CO['"]/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('creates goods receipt via createGoodsReceipt action', () => {
    assert.match(src, /action\/createGoodsReceipt/);
  });

  it('creates purchase invoice via createPurchaseInvoice action', () => {
    assert.match(src, /action\/createPurchaseInvoice/);
  });

  it('dispatches purchase-order:document-created after confirmation', () => {
    assert.match(src, /purchase-order:document-created/);
    assert.match(src, /dispatchEvent/);
  });

  it('exposes receipt + invoice optional checkboxes inside the confirm modal', () => {
    assert.match(src, /<PoCheckboxCard/);
    assert.match(src, /poCreateReceiptTitle/);
    assert.match(src, /soCreateInvoiceTitle/);
  });

  it('calculates pending procurement quantity from order lines', () => {
    assert.match(src, /qtyOrdered/);
    assert.match(src, /qtyDelivered/);
    assert.match(src, /qtyPending/);
  });

  it('exposes draft-aware Gestionar button via i18n keys', () => {
    assert.match(src, /needsReceipt/);
    assert.match(src, /needsInvoice/);
    assert.match(src, /poManageReceiptAndInvoice/);
    assert.match(src, /poManageReceipt/);
    assert.match(src, /poManageInvoice/);
  });

  describe('ConfirmModal total-discount preview (ETP-4006)', () => {
    it('applies the total-discount factor only while the purchase order is still in DR', () => {
      assert.match(src, /const discountPct\s*=\s*Number\(d\.etgoTotalDiscount \?\? 0\)/);
      assert.match(src, /const isPreCompletion\s*=\s*d\.documentStatus === 'DR'/);
      assert.match(src, /const discountFactor\s*=\s*\(isPreCompletion && discountPct > 0\) \? \(1 - discountPct \/ 100\) : 1/);
    });

    it('computes grandTotal as round(net × factor) + round(tax × factor), not round(gross × factor) (ETP-4017)', () => {
      // Anti-double-rounding rule: see DocumentTotalsPanel / documentTotals.js.
      // The displayed total must equal sum of displayed components so it agrees
      // with the order's right panel and with AEAT-compliant printed invoices.
      assert.match(src, /const round2\s*=\s*\(n\) => Math\.round\(\(n \+ Number\.EPSILON\) \* 100\) \/ 100/);
      assert.match(src, /const grossBase\s*=\s*Number\(d\.grandTotalAmount \?\? d\.grandTotal \?\? 0\) \|\| 0/);
      assert.match(src, /const netBase\s*=\s*Number\(d\.summedLineAmount \?\? d\.totalLines \?\? grossBase\) \|\| 0/);
      assert.match(src, /const totalLines\s*=\s*round2\(netBase \* discountFactor\)/);
      assert.match(src, /const grandTotal\s*=\s*totalLines \+ round2\(\(grossBase - netBase\) \* discountFactor\)/);
    });
  });

  it('navigates to receipt and purchase-invoice detail after creation', () => {
    assert.match(src, /\/goods-receipt\//);
    assert.match(src, /\/purchase-invoice\//);
  });

  // ── Idempotent retry coverage ──────────────────────────────────────────────

  describe('ConfirmModal — idempotent retry', () => {
    it('tracks per-step persisted state in component', () => {
      assert.match(src, /\[orderConfirmed,\s*setOrderConfirmed\]\s*=\s*useState\(false\)/);
      assert.match(src, /\[receiptResult,\s*setReceiptResult\]\s*=\s*useState\(null\)/);
      assert.match(src, /\[invoiceResult,\s*setInvoiceResult\]\s*=\s*useState\(null\)/);
    });

    it('skips order confirmation when orderConfirmed is already true', () => {
      assert.match(src, /if\s*\(!orderConfirmed\)\s*\{[\s\S]*?action\/documentAction[\s\S]*?setOrderConfirmed\(true\)/);
    });

    it('skips createGoodsReceipt when receiptResult is already populated', () => {
      assert.match(src, /if\s*\(createReceipt\s*&&\s*!receiptResult\)/);
    });

    it('skips createPurchaseInvoice when invoiceResult is already populated', () => {
      assert.match(src, /if\s*\(createInvoice\s*&&\s*!invoiceResult\)/);
    });

    it('persists each step result in state right after success', () => {
      assert.match(src, /setReceiptResult\(currentReceipt\)/);
      assert.match(src, /setInvoiceResult\(currentInvoice\)/);
    });

    it('falls back to persisted state when assembling onConfirmed payload', () => {
      assert.match(src, /currentReceipt\s*\?\?\s*receiptResult/);
      assert.match(src, /currentInvoice\s*\?\?\s*invoiceResult/);
    });

    it('locks the receipt checkbox once the receipt was created', () => {
      assert.match(src, /checked=\{createReceipt\s*\|\|\s*Boolean\(receiptResult\)\}/);
      assert.match(src, /onChange=\{\(\)\s*=>\s*!receiptResult\s*&&\s*setCreateReceipt/);
      assert.match(src, /disabled=\{Boolean\(receiptResult\)\}/);
    });

    it('locks the invoice checkbox once the invoice was created', () => {
      assert.match(src, /checked=\{createInvoice\s*\|\|\s*Boolean\(invoiceResult\)\}/);
      assert.match(src, /onChange=\{\(\)\s*=>\s*!invoiceResult\s*&&\s*setCreateInvoice/);
      assert.match(src, /disabled=\{Boolean\(invoiceResult\)\}/);
    });

    it('shows soAlreadyCreated label on the locked card subtitle', () => {
      assert.match(src, /receiptResult\s*\?\s*ui\('soAlreadyCreated'\)/);
      assert.match(src, /invoiceResult\s*\?\s*ui\('soAlreadyCreated'\)/);
    });

    it('runs receipt and invoice steps independently (each in its own try/catch)', () => {
      // Step 2 has its own try/catch — failure does NOT throw out of handleConfirm
      assert.match(
        src,
        /if\s*\(createReceipt\s*&&\s*!receiptResult\)\s*\{\s*try\s*\{[\s\S]*?action\/createGoodsReceipt[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?errors\.push/,
      );
      // Step 3 has its own try/catch — runs even if step 2 failed
      assert.match(
        src,
        /if\s*\(createInvoice\s*&&\s*!invoiceResult\)\s*\{\s*try\s*\{[\s\S]*?action\/createPurchaseInvoice[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?errors\.push/,
      );
    });

    it('aggregates errors from steps 2 and 3 instead of stopping on the first', () => {
      assert.match(src, /const errors\s*=\s*\[\]/);
      assert.match(src, /if\s*\(errors\.length\s*>\s*0\)\s*\{[\s\S]*?setError\(errors\.join\('\\n'\)\)/);
    });

    it('aborts before steps 2 and 3 only when step 1 (documentAction) fails', () => {
      assert.match(
        src,
        /if\s*\(!orderConfirmed\)\s*\{\s*try\s*\{[\s\S]*?action\/documentAction[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?setError[\s\S]*?return;\s*\}/,
      );
    });

    it('uses poOrderConfirmedReceiptError prefix for receipt failures', () => {
      assert.match(src, /ui\('poOrderConfirmedReceiptError'\)/);
    });

    it('renders the error region with whiteSpace: pre-line so multiple errors keep their newline', () => {
      assert.match(src, /whiteSpace:\s*'pre-line'/);
    });

    it('routes close-after-partial-success through onConfirmed so the page reloads on the result modal', () => {
      assert.match(
        src,
        /const handleClose\s*=\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(orderConfirmed\s*\|\|\s*receiptResult\s*\|\|\s*invoiceResult\)[\s\S]*?onConfirmed\(result\)[\s\S]*?return;[\s\S]*?\}[\s\S]*?onClose\(\);/,
      );
      assert.match(src, /<div onClick=\{handleClose\} style=\{overlayStyle\}>/);
      assert.match(src, /onClick=\{handleClose\} style=\{closeBtn\}/);
      assert.match(src, /onClick=\{handleClose\} disabled=\{loading\}/);
    });
  });

  describe('PoCheckboxCard — disabled (already-done) treatment', () => {
    it('accepts a disabled prop', () => {
      assert.match(src, /function PoCheckboxCard\(\{[^}]*disabled[^}]*\}\)/);
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
  // receipt-only result. The arrow now comes from the modal's SVG, not the label.
  describe('ConfirmResultModal primary label (ETP-4312 regression)', () => {
    it('does not force a hardcoded soViewInvoice primary label', () => {
      assert.doesNotMatch(src, /primary=\{ui\('soViewInvoice'\)\}/);
    });

    it('does not pass any hardcoded primary view label to the modal', () => {
      assert.doesNotMatch(src, /primary=\{ui\('(soViewInvoice|poViewInvoice|soViewShipment|poViewReceipt|sqViewOrder)'\)\}/);
    });
  });
});
