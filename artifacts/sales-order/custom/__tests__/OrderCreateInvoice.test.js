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

  // ETP-4779 — live user report: generating an invoice from a confirmed Sales
  // Order still required a manual page reload for the "Documentos" panel to
  // update. Root cause, confirmed by reproducing live on localhost:3100 (same
  // method used to diagnose and fix the identical bug in
  // artifacts/purchase-order/custom/PurchaseOrderActions.jsx): handleConfirm
  // dispatched sales-order:document-created right after Step 1
  // (documentAction=CO), BEFORE Steps 2/3 (createShipment /
  // createDraftInvoice) had even run — so RelatedDocuments.jsx's refetch
  // raced ahead of document creation, found nothing, and — since no later
  // event fired to catch up — the panel stayed empty. CreateDocsModal (the
  // separate "Gestionar" modal for already-CO orders, further below in this
  // file) never had this bug — it already dispatched once, after its POST(s)
  // resolved. QA's original 2026-08-11 pass on Sales Order happened not to
  // hit this timing-dependent race.
  describe('event dispatch ordering — must fire AFTER shipment/invoice creation, not right after Step 1 (ETP-4779)', () => {
    it('does NOT dispatch document-created inside the Step 1 (documentAction) success block', () => {
      const step1Block = src.match(
        /if\s*\(!orderConfirmed\)\s*\{\s*try\s*\{[\s\S]*?setOrderConfirmed\(true\);[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?\}\s*\}/,
      );
      assert.ok(step1Block, 'could not locate the Step 1 try/catch block');
      assert.doesNotMatch(
        step1Block[0],
        /sales-order:document-created/,
        'the event must not be dispatched from inside Step 1 — that runs before the shipment/invoice POSTs',
      );
    });

    it('dispatches document-created after both finalShipment/finalInvoice are resolved, right before onConfirmed(...)', () => {
      assert.match(
        src,
        /const finalShipment\s*=\s*currentShipment\s*\?\?\s*shipmentResult;\s*const finalInvoice\s*=\s*currentInvoice\s*\?\?\s*invoiceResult;[\s\S]*?if\s*\(finalShipment\s*\|\|\s*finalInvoice\)\s*\{\s*window\.dispatchEvent\(new CustomEvent\('sales-order:document-created'\)\);\s*\}\s*onConfirmed\(\{/,
      );
    });

    it('guards the dispatch so it never fires when neither a shipment nor an invoice was created', () => {
      assert.match(src, /if\s*\(finalShipment\s*\|\|\s*finalInvoice\)\s*\{\s*window\.dispatchEvent/);
    });

    it('the errors.length early-return sits BEFORE the dispatch — a failed step must not fire the event for a half-finished result', () => {
      const errorsIdx = src.indexOf('if (errors.length > 0) {');
      const dispatchIdx = src.lastIndexOf("window.dispatchEvent(new CustomEvent('sales-order:document-created'))");
      assert.ok(errorsIdx >= 0 && dispatchIdx >= 0);
      assert.ok(errorsIdx < dispatchIdx);
    });

    it('handleClose also dispatches when closing after a partial success (shipment or invoice already created)', () => {
      assert.match(
        src,
        /const handleClose\s*=\s*\(\)\s*=>\s*\{\s*if\s*\(orderConfirmed\s*\|\|\s*shipmentResult\s*\|\|\s*invoiceResult\)\s*\{[\s\S]*?if\s*\(shipmentResult\s*\|\|\s*invoiceResult\)\s*\{\s*window\.dispatchEvent\(new CustomEvent\('sales-order:document-created'\)\);\s*\}\s*onConfirmed\(\{/,
      );
    });
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
      // ETP-4779 — extracted from the onConfirmed(...) call site into named
      // consts (finalShipment/finalInvoice) so the dispatch guard below can
      // reuse them; the fallback logic itself is unchanged.
      assert.match(src, /const finalShipment\s*=\s*currentShipment\s*\?\?\s*shipmentResult;/);
      assert.match(src, /const finalInvoice\s*=\s*currentInvoice\s*\?\?\s*invoiceResult;/);
      assert.match(src, /onConfirmed\(\{\s*shipment:\s*finalShipment,\s*invoice:\s*finalInvoice,\s*\}\);/);
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
      assert.match(src, /<div data-testid="sales-order-confirm-modal" onClick=\{handleClose\} style=\{overlayStyle\}>/);
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

    it('switches to semantic success roles when disabled', () => {
      assert.match(src, /disabled\s*\?\s*'2px solid var\(--status-success-border\)'/);
      assert.match(src, /background:\s*disabled\s*\?\s*'var\(--status-success-bg\)'/);
      assert.match(src, /color:\s*disabled\s*\?\s*'var\(--status-success-fg\)'/);
    });

    it('renders the checkmark for both checked and disabled states', () => {
      assert.match(src, /\(checked\s*\|\|\s*disabled\)\s*&&\s*\(/);
    });
  });

  describe('semantic color roles (ETP-4767)', () => {
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
  // shipment-only result. The arrow now comes from the modal's SVG, not the label.
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
      assert.match(src, /export default function OrderCreateInvoice\(\{[^}]*onSave[^}]*\}\)/);
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
      // The onSave guard runs before Step 1's documentAction POST
      const saveGuardIdx = src.indexOf('if (onSave) {');
      const step1Idx = src.indexOf('action/documentAction');
      assert.ok(saveGuardIdx >= 0 && step1Idx >= 0 && saveGuardIdx < step1Idx);
    });

    it('shows the dedicated soSaveBeforeConfirmError message on save-guard failure (not the generic soErrorOccurred)', () => {
      assert.match(src, /if\s*\(!saved\?\.id\)\s*\{\s*setError\(ui\('soSaveBeforeConfirmError'\)\);/);
    });
  });

  // ETP-4717 (Pair 2 — P2): the Send button/modal must only be available once
  // the order is Confirmed (CO), not while it is still Draft (DR). Grid and
  // Form-view must agree on the same rule.
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

  // ETP-4567 (QA finding 2): the confirmation modal's big grand-total amount showed a
  // hardcoded '0,00' whenever the computed total was <= 0 (e.g. a fully-negative order),
  // while the subtotal line a few lines below already called formatCurrency
  // unconditionally and rendered the signed value correctly (e.g. -46,50 €). Both
  // ConfirmModal and CreateDocsModal must render grandTotal through formatCurrency
  // unconditionally, exactly like the working subtotal line already does.
  describe('grand-total modal amount renders negative totals correctly (ETP-4567)', () => {
    it('does not gate grandTotal behind a >0 ternary that falls back to a hardcoded 0,00 string', () => {
      const gatedOccurrences = (
        src.match(/\{grandTotal > 0 \? formatCurrency\(currency, grandTotal\) : '0,00'\}/g) || []
      ).length;
      assert.equal(
        gatedOccurrences,
        0,
        'grandTotal must render unconditionally via formatCurrency, not fall back to a literal 0,00 for zero/negative totals',
      );
    });

    it('renders grandTotal unconditionally via formatCurrency in both ConfirmModal and CreateDocsModal', () => {
      const unconditionalOccurrences = (
        src.match(/\{formatCurrency\(currency, grandTotal\)\}/g) || []
      ).length;
      assert.equal(
        unconditionalOccurrences,
        2,
        'expected exactly 2 unconditional formatCurrency(currency, grandTotal) renders: ConfirmModal + CreateDocsModal',
      );
    });
  });

  // ETP-4567 (QA finding — bug B): `qtyPending`/`totalPending` are floored via
  // `Math.max(0, ...)`, and `needsShip`/`needsInvoice` gate on `> 0`. For a
  // confirmed order with a NEGATIVE grandTotalAmount and no invoice yet, the
  // real pending amount is negative — the clamp floors it to 0, so
  // `needsInvoice` is always false. This hides the "Gestionar pedido" button
  // AND the "Crear factura" checkbox inside CreateDocsModal, and makes
  // ManageDocsLauncher silently no-op (`nothingToManage = true`) instead of
  // opening the modal — a grid row quick action that does nothing.
  //
  // These tests extract the LITERAL computation source from the file (not a
  // hand-copied re-implementation) and execute it via `new Function(...)`, so
  // they exercise the real arithmetic/branching and will track the fix
  // automatically once the clamp is dropped for `!== 0` comparisons.
  describe('needsInvoice/needsShip pending computation (ETP-4567 bug B)', () => {
    function extractComputationBlocks(source) {
      // ETP-4567: post-fix source drops the Math.max(0, ...) clamp entirely —
      // qtyPending/totalPending are now plain (possibly negative) differences.
      const re = /const qtyOrdered[\s\S]*?const totalPending\s*=\s*totalOrder - totalInvoiced;/g;
      return [...source.matchAll(re)].map(m => m[0]);
    }
    function extractNeedsBlocks(source, needsVarName) {
      // ETP-4567: post-fix source compares against 0 with !== instead of the
      // clamp-dependent > 0 (which always failed for a floored-to-zero pending).
      const re = new RegExp(
        `const ${needsVarName}[\\s\\S]*?const needsInvoice\\s*=\\s*totalPending !== 0 && !invoiceDraft;`,
        'g',
      );
      return [...source.matchAll(re)].map(m => m[0]);
    }

    const compBlocks = extractComputationBlocks(src);
    const needsBlocks = extractNeedsBlocks(src, 'needsShip');

    it('finds exactly 2 occurrences of the computation+needs blocks (main component + ManageDocsLauncher)', () => {
      assert.equal(compBlocks.length, 2);
      assert.equal(needsBlocks.length, 2);
    });

    function evaluate(siteIndex, { grandTotalAmount, invoicesComplete = [], shipmentsDraft = [], invoiceDraft = null }) {
      const body = `${compBlocks[siteIndex]}\n${needsBlocks[siteIndex]}\nreturn { qtyPending, totalPending, needsShip, needsInvoice };`;
      // eslint-disable-next-line no-new-func -- deliberately eval'ing the literal source under test
      const fn = new Function('data', 'orderLines', 'invoicesComplete', 'shipmentsDraft', 'invoiceDraft', body);
      return fn({ grandTotalAmount }, [], invoicesComplete, shipmentsDraft, invoiceDraft);
    }

    const sites = [
      ['main component (Gestionar button + CreateDocsModal gate)', 0],
      ['ManageDocsLauncher', 1],
    ];

    for (const [siteName, siteIndex] of sites) {
      describe(siteName, () => {
        it('RED: needsInvoice is true for a negative grandTotal with no invoice yet (currently false — the clamp floors negative pending to 0)', () => {
          const { needsInvoice } = evaluate(siteIndex, { grandTotalAmount: -450.75 });
          assert.equal(needsInvoice, true);
        });

        it('regression guard: fully invoiced positive order — needsInvoice stays false', () => {
          const { needsInvoice } = evaluate(siteIndex, {
            grandTotalAmount: 100,
            invoicesComplete: [{ grandTotalAmount: 100, documentStatus: 'CO' }],
          });
          assert.equal(needsInvoice, false);
        });

        it('regression guard: partially invoiced positive order — needsInvoice stays true', () => {
          const { needsInvoice } = evaluate(siteIndex, {
            grandTotalAmount: 100,
            invoicesComplete: [{ grandTotalAmount: 60, documentStatus: 'CO' }],
          });
          assert.equal(needsInvoice, true);
        });

        // NOTE (flagged, not decided here — see report): this asserts the fix's
        // INTENDED post-fix behavior per the investigation, not a pre-existing
        // bug. Under the old clamp this state (pending < 0 for a POSITIVE order)
        // was always hidden; the `!== 0` fix makes it reachable again because
        // pending is nonzero (just negative). Whether an over-invoiced positive
        // order should re-show "Crear factura" is a product judgment call above
        // this test's scope — it is written here only to document/pin the fix's
        // actual resulting behavior once applied.
        it('documents post-fix behavior: over-invoiced positive order (pending=-40) → needsInvoice=true, a state unreachable under the old clamp', () => {
          const { needsInvoice } = evaluate(siteIndex, {
            grandTotalAmount: 100,
            invoicesComplete: [{ grandTotalAmount: 140, documentStatus: 'CO' }],
          });
          assert.equal(needsInvoice, true);
        });
      });
    }

    it('ManageDocsLauncher does not treat a negative-total order as "nothing to manage" (would otherwise silently no-op the quick action)', () => {
      const { needsShip, needsInvoice } = evaluate(1, { grandTotalAmount: -450.75 });
      const nothingToManage = !needsShip && !needsInvoice;
      assert.equal(nothingToManage, false);
    });
  });

  // ETP-4567 (QA finding — bug B, item 4): same clamp-adjacent pattern in the
  // subtitle copy shown inside each checkbox card. `qtyOrdered > 0` /
  // `totalOrder > 0` gate the quantified "X pending" subtitle — for a negative
  // qty/total the subtitle silently falls back to the generic
  // soCreateShipmentCheckDesc/soCreateInvoiceCheckDesc copy instead of telling
  // the user what's actually pending.
  describe('subtitle text falls back to generic copy for negative qty/total (ETP-4567 bug B, item 4)', () => {
    function extractSubtitleBlock(varName, fallbackKey) {
      const re = new RegExp(`const ${varName} = [\\s\\S]*?ui\\('${fallbackKey}'\\);`);
      const m = src.match(re);
      assert.ok(m, `expected to find a ${varName} block ending in ui('${fallbackKey}')`);
      return m[0];
    }

    const mockUi = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
    // Lightweight stand-in matching the real fmtNum's number->string contract —
    // not itself under test, only needed to satisfy the extracted expression.
    const fmtNum = (v, decimals = 2) =>
      v != null && v !== '' && !isNaN(Number(v))
        ? Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : '0';

    it('RED: shipmentSubtitle shows the quantified pending message, not the generic fallback, for negative qtyOrdered', () => {
      const block = extractSubtitleBlock('shipmentSubtitle', 'soCreateShipmentCheckDesc');
      // eslint-disable-next-line no-new-func -- deliberately eval'ing the literal source under test
      const fn = new Function('qtyOrdered', 'qtyDelivered', 'qtyPending', 'ui', 'fmtNum', `${block}\nreturn shipmentSubtitle;`);
      const result = fn(-5, 0, 5, mockUi, fmtNum);
      assert.notEqual(result, 'soCreateShipmentCheckDesc');
      assert.match(result, /soQtyPendingDelivery/);
    });

    it('RED: invoiceSubtitle shows the quantified pending message, not the generic fallback, for negative totalOrder', async () => {
      const { formatCurrency } = await import('../../../../tools/app-shell/src/lib/formatCurrency.js');
      const block = extractSubtitleBlock('invoiceSubtitle', 'soCreateInvoiceCheckDesc');
      // eslint-disable-next-line no-new-func -- deliberately eval'ing the literal source under test
      const fn = new Function(
        'totalOrder', 'totalInvoiced', 'totalPending', 'currency', 'ui', 'fmtNum', 'formatCurrency',
        `${block}\nreturn invoiceSubtitle;`,
      );
      const result = fn(-100, 0, -100, 'EUR', mockUi, fmtNum, formatCurrency);
      assert.notEqual(result, 'soCreateInvoiceCheckDesc');
      assert.match(result, /soAmountPendingInvoice/);
    });
  });

  // ETP-4888 (commit b30276a14) — 6 call sites (ConfirmModal's step1/2/3,
  // CreateDocsModal's shipment/invoice, and CloneModal's handleClone) were
  // missing the flat `e?.message`/`json?.message` fallback. A business-rule
  // rejection (e.g. C_Order_Post) returns a FLAT `{ status, message }` body —
  // no `error`/`response` wrapper — and before the fix that shape fell
  // through to a generic "Error (400)"/"Process failed (400)" message,
  // silently hiding the real Spanish reason from the user. Each test below
  // extracts the REAL fallback expression from the live source (not a
  // hand-copied duplicate) via balanced-paren slicing and executes it, so
  // reverting the fix at any single call site fails only that test.
  describe('silent generic error message — real backend message surfaces (ETP-4888)', () => {
    // Extracts the argument list of the first `callPrefix(...)` call found
    // AFTER `marker` in `source` (balanced-paren aware, so nested `(...)` in
    // the expression — e.g. `ui('...')` — don't truncate the extraction).
    function extractCallExprAfter(source, marker, callPrefix) {
      const markerIdx = source.indexOf(marker);
      assert.ok(markerIdx !== -1, `marker not found: ${marker}`);
      const callIdx = source.indexOf(callPrefix, markerIdx);
      assert.ok(callIdx !== -1, `call not found after marker "${marker}": ${callPrefix}`);
      const parenStart = callIdx + callPrefix.length;
      let depth = 1;
      let i = parenStart;
      for (; i < source.length; i++) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') { depth--; if (depth === 0) break; }
      }
      assert.ok(depth === 0, `unbalanced parens extracting "${callPrefix}" after "${marker}"`);
      return source.slice(parenStart, i);
    }

    // Same as above, but finds the call PRECEDING the marker (for call sites
    // where the marker text — e.g. an i18n key — sits INSIDE the call's own
    // argument list, so a forward search from the marker would skip past the
    // call's own opening paren and land on the next occurrence instead).
    function extractCallExprAround(source, marker, callPrefix) {
      const markerIdx = source.indexOf(marker);
      assert.ok(markerIdx !== -1, `marker not found: ${marker}`);
      const callIdx = source.lastIndexOf(callPrefix, markerIdx);
      assert.ok(callIdx !== -1, `call not found before marker "${marker}": ${callPrefix}`);
      const parenStart = callIdx + callPrefix.length;
      let depth = 1;
      let i = parenStart;
      for (; i < source.length; i++) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') { depth--; if (depth === 0) break; }
      }
      assert.ok(depth === 0, `unbalanced parens extracting "${callPrefix}" around "${marker}"`);
      return source.slice(parenStart, i);
    }

    const REAL_MESSAGE = 'El pedido no puede confirmarse: falta el almacén';
    // The exact shape the real backend returns for a C_Order_Post
    // business-rule rejection — flat, no nested error/response wrapper.
    const flatErrBody = (message = REAL_MESSAGE) => ({ status: 'error', message });

    describe('ConfirmModal.handleConfirm — Step 1 (documentAction/confirm)', () => {
      function resolveMessage(e, processRes) {
        const expr = extractCallExprAfter(src, 'action/documentAction', 'throw new Error(');
        return new Function('e', 'processRes', `return ${expr};`)(e, processRes);
      }

      it('surfaces the real backend message for a flat {status,message} 400 body', () => {
        assert.equal(resolveMessage(flatErrBody(), { status: 400 }), REAL_MESSAGE);
      });

      it('does not fall back to the generic "Error (400)" message', () => {
        assert.notEqual(resolveMessage(flatErrBody(), { status: 400 }), 'Error (400)');
      });

      it('falls back to "Error (status)" only when there is truly no message', () => {
        assert.equal(resolveMessage(null, { status: 500 }), 'Error (500)');
      });
    });

    describe('ConfirmModal.handleConfirm — Step 2 (createShipment)', () => {
      function resolveMessage(e, res) {
        const expr = extractCallExprAround(src, 'soOrderConfirmedShipmentError', 'throw new Error(');
        const fn = new Function('e', 'res', 'ui', `return ${expr};`);
        return fn(e, res, (k) => k);
      }

      it('appends the real backend message after the ui() prefix for a flat 400 body', () => {
        assert.equal(resolveMessage(flatErrBody(), { status: 400 }), `soOrderConfirmedShipmentError${REAL_MESSAGE}`);
      });

      it('does not fall back to the generic "Error (400)" suffix', () => {
        assert.doesNotMatch(resolveMessage(flatErrBody(), { status: 400 }), /Error \(400\)$/);
      });
    });

    describe('ConfirmModal.handleConfirm — Step 3 (createDraftInvoice)', () => {
      function resolveMessage(e, res) {
        const expr = extractCallExprAround(src, 'soOrderConfirmedInvoiceError', 'throw new Error(');
        const fn = new Function('e', 'res', 'ui', `return ${expr};`);
        return fn(e, res, (k) => k);
      }

      it('appends the real backend message after the ui() prefix for a flat 400 body', () => {
        assert.equal(resolveMessage(flatErrBody(), { status: 400 }), `soOrderConfirmedInvoiceError${REAL_MESSAGE}`);
      });

      it('does not fall back to the generic "Error (400)" suffix', () => {
        assert.doesNotMatch(resolveMessage(flatErrBody(), { status: 400 }), /Error \(400\)$/);
      });
    });

    describe('CreateDocsModal.handleCreate — shipment step (sibling to ConfirmModal, ETP-4888)', () => {
      const createDocsModalSrc = src.slice(src.indexOf('export function CreateDocsModal'));

      function resolveMessage(e, res) {
        const expr = extractCallExprAfter(createDocsModalSrc, 'action/createShipment', 'throw new Error(');
        return new Function('e', 'res', `return ${expr};`)(e, res);
      }

      it('surfaces the real backend message for a flat {status,message} 400 body', () => {
        assert.equal(resolveMessage(flatErrBody(), { status: 400 }), REAL_MESSAGE);
      });

      it('does not fall back to the generic "Error (400)" message', () => {
        assert.notEqual(resolveMessage(flatErrBody(), { status: 400 }), 'Error (400)');
      });
    });

    describe('CreateDocsModal.handleCreate — invoice step (sibling to ConfirmModal, ETP-4888)', () => {
      const createDocsModalSrc = src.slice(src.indexOf('export function CreateDocsModal'));

      function resolveMessage(e, res) {
        const expr = extractCallExprAfter(createDocsModalSrc, 'action/createDraftInvoice', 'throw new Error(');
        return new Function('e', 'res', `return ${expr};`)(e, res);
      }

      it('surfaces the real backend message for a flat {status,message} 400 body', () => {
        assert.equal(resolveMessage(flatErrBody(), { status: 400 }), REAL_MESSAGE);
      });

      it('does not fall back to the generic "Error (400)" message', () => {
        assert.notEqual(resolveMessage(flatErrBody(), { status: 400 }), 'Error (400)');
      });
    });

    describe('CloneModal.handleClone', () => {
      const cloneModalSrc = src.slice(src.indexOf('function CloneModal'));

      function resolveMessage(json, ui) {
        const expr = extractCallExprAfter(cloneModalSrc, 'action/cloneRecord', 'setError(');
        const fn = new Function('json', 'ui', `return ${expr};`);
        return fn(json, ui);
      }

      it('surfaces the real backend message for a flat {status,message} 400 body', () => {
        assert.equal(resolveMessage(flatErrBody(), (k) => k), REAL_MESSAGE);
      });

      it('does not fall back to the generic cloneOrderError i18n key when a flat message is present', () => {
        assert.notEqual(resolveMessage(flatErrBody(), (k) => k), 'cloneOrderError');
      });

      it('still falls back to the cloneOrderError i18n key when the body has no message at all', () => {
        assert.equal(resolveMessage({}, (k) => k), 'cloneOrderError');
      });

      it('keeps preferring the nested json.response.error.message over the flat json.message', () => {
        const nested = { response: { error: { message: 'Nested clone message' } }, message: 'Flat message' };
        assert.equal(resolveMessage(nested, (k) => k), 'Nested clone message');
      });
    });
  });
});
