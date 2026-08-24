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

  // ETP-4779 (reject cycle #2) — QA's live retest on localhost:3100 showed the
  // "Documentos" panel STILL never updated after confirming a Draft order with
  // "Crear albarán de proveedor" + "Crear factura" both checked, even after
  // RelatedDocuments.jsx gained its event listener in the previous fix pass.
  // Root cause, found by reproducing live: handleConfirm dispatched
  // purchase-order:document-created right after Step 1 (documentAction=CO),
  // BEFORE Steps 2/3 (createGoodsReceipt / createPurchaseInvoice) had even
  // run — so the listener's refetch always raced ahead of document creation
  // and came back empty, with no later event to catch up. CreateDocsModal
  // (the separate "Gestionar" modal for already-CO orders, further below in
  // this file) never had this bug — it already dispatched once, after its
  // POST(s) resolved.
  describe('event dispatch ordering — must fire AFTER receipt/invoice creation, not right after Step 1 (ETP-4779)', () => {
    it('does NOT dispatch document-created inside the Step 1 (documentAction) success block', () => {
      const step1Block = src.match(
        /if\s*\(!orderConfirmed\)\s*\{\s*try\s*\{[\s\S]*?setOrderConfirmed\(true\);[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?\}\s*\}/,
      );
      assert.ok(step1Block, 'could not locate the Step 1 try/catch block');
      assert.doesNotMatch(
        step1Block[0],
        /purchase-order:document-created/,
        'the event must not be dispatched from inside Step 1 — that runs before the receipt/invoice POSTs',
      );
    });

    it('dispatches document-created after both currentReceipt/currentInvoice are resolved, right before onConfirmed(result)', () => {
      assert.match(
        src,
        /const finalReceipt\s*=\s*currentReceipt\s*\?\?\s*receiptResult;\s*const finalInvoice\s*=\s*currentInvoice\s*\?\?\s*invoiceResult;[\s\S]*?if\s*\(finalReceipt\s*\|\|\s*finalInvoice\)\s*\{\s*window\.dispatchEvent\(new CustomEvent\('purchase-order:document-created'\)\);\s*\}\s*onConfirmed\(result\);/,
      );
    });

    it('guards the dispatch so it never fires when neither a receipt nor an invoice was created', () => {
      assert.match(src, /if\s*\(finalReceipt\s*\|\|\s*finalInvoice\)\s*\{\s*window\.dispatchEvent/);
    });

    it('the errors.length early-return sits BEFORE the dispatch — a failed step must not fire the event for a half-finished result', () => {
      const errorsIdx = src.indexOf('if (errors.length > 0) {');
      const dispatchIdx = src.lastIndexOf("window.dispatchEvent(new CustomEvent('purchase-order:document-created'))");
      assert.ok(errorsIdx >= 0 && dispatchIdx >= 0);
      assert.ok(errorsIdx < dispatchIdx);
    });

    it('handleClose also dispatches when closing after a partial success (receipt or invoice already created)', () => {
      assert.match(
        src,
        /const handleClose\s*=\s*\(\)\s*=>\s*\{\s*if\s*\(orderConfirmed\s*\|\|\s*receiptResult\s*\|\|\s*invoiceResult\)\s*\{[\s\S]*?if\s*\(receiptResult\s*\|\|\s*invoiceResult\)\s*\{\s*window\.dispatchEvent\(new CustomEvent\('purchase-order:document-created'\)\);\s*\}\s*onConfirmed\(result\);/,
      );
    });
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

    it('switches to semantic success roles when disabled', () => {
      assert.match(src, /disabled\s*\?\s*'2px solid var\(--status-success-border\)'/);
      assert.match(src, /background:\s*disabled\s*\?\s*'var\(--status-success-bg\)'/);
      assert.match(src, /color:\s*disabled\s*\?\s*'var\(--status-success-fg\)'/);
    });

    it('renders the checkmark for both checked and disabled states', () => {
      assert.match(src, /\(checked\s*\|\|\s*disabled\)\s*&&\s*\(/);
    });
  });

  describe('semantic color roles (ETP-4781)', () => {
    it('uses foreground roles for selected and completed checkbox indicators', () => {
      assert.match(src, /background:\s*disabled\s*\?\s*'var\(--status-success-fg\)'\s*:\s*\(checked\s*\?\s*'var\(--status-info-fg\)'/);
    });

    it('uses semantic surface roles for the confirmation summary and warning', () => {
      assert.match(src, /background: 'var\(--status-info-bg\)', border: '0\.5px solid var\(--status-info-border\)'/);
      assert.match(src, /background: 'var\(--status-warning-bg\)', border: '1px solid var\(--status-warning-border\)'/);
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

  // ETP-4468: "Confirmar" must not discard an unsaved header edit — force-save
  // first, and the in-memory data prop must win over the stale server fetch.
  describe('force-save before confirm (ETP-4468)', () => {
    it('accepts an onSave prop on the default-exported component', () => {
      assert.match(src, /export default function PurchaseOrderActions\(\{[^}]*onSave[^}]*\}\)/);
    });

    it('threads onSave down to the internal ConfirmModal usage', () => {
      assert.match(src, /<ConfirmModal[\s\S]*?onSave=\{onSave\}[\s\S]*?\/>/);
    });

    it('ConfirmModal accepts an onSave prop', () => {
      assert.match(src, /export function ConfirmModal\(\{[^}]*onSave[^}]*\}\)/);
    });

    it('in-memory data wins over the stale freshData fetch', () => {
      assert.match(src, /const d\s*=\s*data \|\| freshData \|\| \{\}/);
      assert.doesNotMatch(src, /const d\s*=\s*freshData \|\| data \|\| \{\}/);
    });

    it('calls onSave before the documentAction POST and aborts on failure', () => {
      assert.match(
        src,
        /if\s*\(onSave\)\s*\{\s*const saved\s*=\s*await onSave\(\);\s*if\s*\(!saved\?\.id\)\s*\{[\s\S]*?setError\([\s\S]*?setLoading\(false\);\s*return;\s*\}\s*\}/,
      );
      const saveGuardIdx = src.indexOf('if (onSave) {');
      const step1Idx = src.indexOf('action/documentAction');
      assert.ok(saveGuardIdx >= 0 && step1Idx >= 0 && saveGuardIdx < step1Idx);
    });

    it('shows the dedicated poSaveBeforeConfirmError message on save-guard failure (not the generic poErrorOccurred)', () => {
      assert.match(src, /if\s*\(!saved\?\.id\)\s*\{\s*setError\(ui\('poSaveBeforeConfirmError'\)\);/);
    });
  });

  // ETP-4717 (Pair 2 — P2): the Send button/modal must only be available once
  // the purchase order is Confirmed (CO), not while it is still Draft (DR).
  // Grid and Form-view must agree on the same rule.
  describe('Send button visibility gated by document status (ETP-4717)', () => {
    it('does NOT show the Send button while the order is still Draft (DR)', () => {
      assert.doesNotMatch(src, /\{\(isDraft \|\| isCompleted\) && <SendDocumentButton/);
    });

    it('shows the Send button only when the order is Completed (CO)', () => {
      assert.match(src, /\{isCompleted && <SendDocumentButton/);
    });

    it('does NOT gate the SendDocumentModal render on isDraft', () => {
      assert.doesNotMatch(
        src,
        /\{\(isDraft \|\| isCompleted\) && showSend && createPortal\(\s*<SendDocumentModal/,
      );
    });

    it('gates the SendDocumentModal render on isCompleted only', () => {
      assert.match(src, /\{isCompleted && showSend && createPortal\(\s*<SendDocumentModal/);
    });
  });
});
