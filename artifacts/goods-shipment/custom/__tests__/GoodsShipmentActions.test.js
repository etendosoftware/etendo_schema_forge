import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAdjacentStatements } from '../../../_test-support/sourceAdjacency.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsShipmentActions.jsx'), 'utf8');

describe('GoodsShipmentActions', () => {
  it('exports a default function component named GoodsShipmentActions', () => {
    assert.match(src, /export default function GoodsShipmentActions/);
  });

  describe('removed billing-badge inline rendering (moved to GoodsShipmentBillingBadge)', () => {
    it('does not import or reference any Tag component for billing status', () => {
      assert.doesNotMatch(src, /import\s+.*Tag.*from/);
    });

    it('does not compute invoicePct variable', () => {
      assert.doesNotMatch(src, /\binvoicePct\b/);
    });

    it('does not compute invoiceVariant variable', () => {
      assert.doesNotMatch(src, /\binvoiceVariant\b/);
    });

    it('does not compute invoiceLabel variable', () => {
      assert.doesNotMatch(src, /\binvoiceLabel\b/);
    });
  });

  describe('isFullyInvoiced — still required for Create Invoice button visibility', () => {
    it('computes isFullyInvoiced using invoiceStatus', () => {
      assert.match(src, /isFullyInvoiced\s*=/);
    });

    it('uses invoiceStatus >= 100 as the fully-invoiced threshold', () => {
      assert.match(src, /data\?\.invoiceStatus\s*>=\s*100/);
    });

    it('does not gate on linkedInvoices presence (partial invoicing must remain invoiceable)', () => {
      assert.doesNotMatch(src, /linkedInvoices\.length\s*>\s*0.*isFullyInvoiced|isFullyInvoiced.*linkedInvoices\.length\s*>\s*0/);
    });
  });

  describe('Create Invoice button visibility', () => {
    it('only shows the Create Invoice button when isCompleted and not isFullyInvoiced', () => {
      assert.match(src, /isCompleted\s*&&\s*!isFullyInvoiced/);
    });

    it('gates the button on documentStatus being CO', () => {
      assert.match(src, /data\?\.documentStatus\s*===\s*['"]CO['"]/);
    });
  });

  describe('GoodsShipmentConfirmModal integration', () => {
    it('imports GoodsShipmentConfirmModal', () => {
      assert.match(src, /import\s+GoodsShipmentConfirmModal\s+from/);
    });

    it('listens to the goods-shipment:open-confirm-modal custom event', () => {
      assert.match(src, /['"]goods-shipment:open-confirm-modal['"]/);
    });

    it('adds and removes the event listener via useEffect', () => {
      assert.match(src, /window\.addEventListener\(['"]goods-shipment:open-confirm-modal['"]/);
      assert.match(src, /window\.removeEventListener\(['"]goods-shipment:open-confirm-modal['"]/);
    });
  });

  describe('ReturnWizard integration', () => {
    it('imports ReturnWizard', () => {
      assert.match(src, /import\s+ReturnWizard\s+from/);
    });

    it('renders ReturnWizard with open, onClose, shipmentData, lines, token, and apiBaseUrl props', () => {
      assert.match(src, /<ReturnWizard[^/]*open=\{wizardOpen\}/s);
    });
  });

  describe('Create Return button visibility — partial return support', () => {
    it('derives canCreateReturn from data?.canCreateReturn === true (backend-computed)', () => {
      assert.match(src, /canCreateReturn\s*=\s*data\?\.canCreateReturn\s*===\s*true/);
    });

    it('does not use hasReturn to gate the create-return button', () => {
      assert.doesNotMatch(src, /\bhasReturn\b/);
    });

    it('gates the create-return button on isCompleted && canCreateReturn', () => {
      assert.match(src, /isCompleted\s*&&\s*canCreateReturn/);
    });
  });

  // ETP-5260 — the Send button itself (SendDocumentButton) moved to the
  // topbarSecondary slot (GoodsShipmentSecondaryActions, which gates it on
  // `isCompleted` — see that component's own test). This component now only
  // owns the SendDocumentModal (with its PDF/documentType context), opened via
  // the `goods-shipment:open-send-modal` window event — see the "listens to
  // goods-shipment:open-confirm-modal"-style wiring assertions below.
  describe('SendDocumentModal integration', () => {
    it('imports SendDocumentModal (but no longer SendDocumentButton — that moved out)', () => {
      assert.match(src, /import\s+SendDocumentModal\s+from/);
      assert.doesNotMatch(src, /SendDocumentButton/);
    });

    it('listens to the goods-shipment:open-send-modal custom event to open its own SendDocumentModal', () => {
      assert.match(src, /window\.addEventListener\(['"]goods-shipment:open-send-modal['"]/);
      assert.match(src, /window\.removeEventListener\(['"]goods-shipment:open-send-modal['"]/);
    });
  });

  describe('i18n compliance', () => {
    it('imports useUI from @/i18n', () => {
      assert.match(src, /useUI/);
      assert.match(src, /from\s*['"]@\/i18n['"]/);
    });
  });

  describe('ETP-4028 — CreateInvoiceConfirmModal price-list picker wiring', () => {
    it('imports CreateInvoiceConfirmModal', () => {
      assert.match(src, /import CreateInvoiceConfirmModal from '@\/components\/contract-ui\/CreateInvoiceConfirmModal'/);
    });

    it('renders CreateInvoiceConfirmModal with showPriceListPicker enabled', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?showPriceListPicker[\s\S]*?\/>/);
    });

    it('passes isSOTrx (bare, defaults to truthy) — goods-shipment offers SALES price lists', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?\bisSOTrx\b[\s\S]*?\/>/);
      // Must not be explicitly set to false for the shipment (sales) flow
      assert.doesNotMatch(src, /<CreateInvoiceConfirmModal[\s\S]*?isSOTrx=\{false\}[\s\S]*?\/>/);
    });

    it('passes apiBaseUrl through to the modal (required for the price-list fetch)', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?apiBaseUrl=\{apiBaseUrl\}[\s\S]*?\/>/);
    });

    // ETP-5333 — onConfirm used to be an inline arrow that closed the modal
    // SYNCHRONOUSLY on click, before the request even started (no loading
    // feedback). It is now wired directly to handleCreateInvoice, which closes
    // the modal itself only once the request succeeds (see the ETP-5333
    // describe block further down).
    it('onConfirm is wired directly to handleCreateInvoice (no inline synchronous close)', () => {
      assert.match(src, /onConfirm=\{handleCreateInvoice\}/);
    });

    it('handleCreateInvoice accepts priceListId and threads it into the POST body', () => {
      assert.match(src, /const handleCreateInvoice = async \(priceListId\) => \{/);
      assert.match(
        src,
        /body: JSON\.stringify\(\{ priceListId \}\)/,
      );
    });

    it('posts to the createDraftInvoice action (sales-side)', () => {
      assert.match(src, /goods-shipment\/goodsShipment\/\$\{recordId\}\/action\/createDraftInvoice/);
    });
  });

  // The single-record modal now shows a real quote too, mirroring BulkInvoiceFromShipment.jsx
  // exactly — but ONLY when this shipment has no linked sales order. createFromShipments'
  // single-shipment-with-order short-circuit into createFromOrder bills the WHOLE order's
  // pending lines (this button sends no line overrides), so a quote computed from just this
  // shipment's own lines would under-report the real invoice total in that case; the modal's
  // existing linkedOrder.grandTotalAmount fallback stays in charge instead.
  describe('single-record quote — gated on hasLinkedOrder', () => {
    it('derives hasLinkedOrder from data.linkedOrders, the same single-record enrichment already received', () => {
      assert.match(src, /const hasLinkedOrder = Array\.isArray\(data\?\.linkedOrders\) && data\.linkedOrders\.length > 0;/);
    });

    it('skips the line/pending fetch entirely when a linked order exists', () => {
      assert.match(
        src,
        /if \(!showInvoiceConfirm \|\| hasLinkedOrder \|\| !recordId\) \{/,
      );
    });

    it('fetches this shipment\'s own lines and pendingInvoiceLines, not a bulk collection', () => {
      assert.match(src, /goods-shipment\/goodsShipmentLine\?parentId=\$\{recordId\}/);
      assert.match(src, /goods-shipment\/goodsShipment\/\$\{recordId\}\/action\/pendingInvoiceLines`, \{ baseUrl: '', token \}/);
    });

    it('prices order-linked LINES from their own order line, unlinked lines from the Tarifa', () => {
      assert.match(src, /sales-order\/lines\/\$\{id\}/);
      assert.match(src, /sales-invoice\/lines\/selectors\/M_Product_ID\?limit=500&offset=0&priceList=/);
      assert.match(
        src,
        /const price = detail\.salesOrderLine\s*\n\s*\?\s*orderLinePrices\[detail\.salesOrderLine\]\s*\n\s*:\s*tariffPrices\[detail\.product\];/,
      );
    });

    it('only overrides the modal default (grandTotal/documentNo) once the quote has actually resolved', () => {
      assert.match(
        src,
        /const cardAmountLabel = quoteAmount != null\s*\n\s*\?\s*formatCurrency\([\s\S]*?, quoteAmount\)\s*\n\s*:\s*undefined;/,
      );
    });

    it('passes cardAmountLabel and onPriceListChange to the modal', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?cardAmountLabel=\{cardAmountLabel\}[\s\S]*?\/>/);
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?onPriceListChange=\{setSelectedPriceListId\}[\s\S]*?\/>/);
    });

    it('uses the authenticated request helper for the new fetches, not a bare fetch', () => {
      assert.match(src, /import \{ useApiFetch \} from '@\/auth\/useApiFetch\.js'/);
      assert.match(src, /const apiFetch = useApiFetch\(\);/);
    });
  });

  // ETP-5265 — the intermediate "already fully invoiced" confirmation popup
  // (ConfirmShipmentInvoicedModal, now deleted entirely) was removed. Confirming
  // a fully-invoiced shipment now calls the documentAction endpoint directly via
  // the canonical useDocumentAction hook — no modal, then the same success path the
  // popup used to trigger (setInvoiceResult({ invoice: null })), or toast.error on
  // failure.
  //
  // ETP-5265 QA follow-up — the in-flight feedback is no longer a floating
  // toast.loading card: the promise is handed back through the CustomEvent `detail`
  // so the core's Confirm button shows its own spinner (see runDraftModeConfirm in
  // tools/app-shell/src/components/contract-ui/saveActions.jsx).
  describe('fully-invoiced confirm skips the modal and calls documentAction directly (ETP-5265)', () => {
    it('no longer imports or references the deleted ConfirmShipmentInvoicedModal', () => {
      assert.doesNotMatch(src, /ConfirmShipmentInvoicedModal/);
    });

    it('imports and uses the canonical useDocumentAction hook', () => {
      assert.match(src, /import\s*\{[^}]*useDocumentAction[^}]*\}\s*from\s*['"]@\/hooks\/useDocumentAction['"]/);
      assert.match(src, /useDocumentAction\(\{[^}]*apiBaseUrl[^}]*entity:\s*['"]goodsShipment['"][^}]*token[^}]*\}\)/s);
    });

    it('defines handleConfirmFullyInvoiced calling confirmDocAction.execute(recordId, "CO")', () => {
      assert.match(src, /const handleConfirmFullyInvoiced\s*=\s*useCallback\(async\s*\(\)\s*=>\s*\{/);
      assert.match(src, /confirmDocAction\.execute\(recordId,\s*['"]CO['"]\)/);
    });

    it('the open-confirm-modal handler branches on isFullyInvoiced: direct action vs the not-fully-invoiced modal', () => {
      assert.match(
        src,
        /const handler = \(e\) => \{\s*if\s*\(isFullyInvoiced\)\s*\{\s*if \(e\?\.detail\) e\.detail\.promise = handleConfirmFullyInvoiced\(\);\s*else handleConfirmFullyInvoiced\(\);\s*\}\s*else\s*\{\s*setShowConfirmModal\(true\);\s*\}\s*\};/,
      );
    });

    // ETP-5265 QA follow-up — this assignment is the whole mechanism behind the
    // spinner: without it the core awaits `undefined` and the button never goes busy.
    // The else-branch fallback keeps a bare CustomEvent (no detail) working.
    it('hands the in-flight promise back to the core through the event detail', () => {
      assert.match(src, /e\.detail\.promise = handleConfirmFullyInvoiced\(\);/);
      assert.match(src, /else handleConfirmFullyInvoiced\(\);/);
    });

    // The modal branch must NOT set detail.promise — opening a modal is instantaneous,
    // and a resolved-but-assigned promise would make the button flash a spinner.
    it('the not-fully-invoiced branch leaves detail.promise unset', () => {
      const handlerIdx = src.indexOf('const handler = (e) =>');
      assert.notEqual(handlerIdx, -1);
      const elseIdx = src.indexOf('setShowConfirmModal(true);', handlerIdx);
      assert.notEqual(elseIdx, -1);
      assert.doesNotMatch(src.slice(elseIdx, elseIdx + 120), /detail\.promise/);
    });

    // ETP-5265 QA follow-up (2) — the fully-invoiced branch no longer routes through
    // setInvoiceResult: that setter's effect toasts AND refreshes but cannot be awaited,
    // so it could not hold the Confirm button busy. It toasts inline instead, at the same
    // point the native draftMode path does (right after the action POST, before the
    // refetch — see useEntity's handleSaveAndProcess), and then AWAITS onRefresh so the
    // button spins until the refreshed record is on screen.
    it('on success, toasts inline and then awaits onRefresh (busy until the record is back)', () => {
      assert.match(
        src,
        /await confirmDocAction\.execute\(recordId, ['"]CO['"]\);[\s\S]*?toast\.success\(ui\('goodsShipment\.confirmModal\.confirmedTitle'\)\);[\s\S]*?await Promise\.resolve\(onRefresh\?\.\(\)\)/,
      );
    });

    it('the success toast fires BEFORE the awaited refresh, mirroring the native path', () => {
      const toastIdx = src.indexOf("toast.success(ui('goodsShipment.confirmModal.confirmedTitle'));");
      const refreshIdx = src.indexOf('await Promise.resolve(onRefresh?.())');
      assert.notEqual(toastIdx, -1);
      assert.notEqual(refreshIdx, -1);
      assert.ok(toastIdx < refreshIdx, 'toast.success must precede the awaited refresh');
    });

    // A refetch failure is NOT a failed confirmation — it must never reach toast.error.
    it('swallows a refresh rejection so it cannot be reported as a failed confirm', () => {
      assert.match(src, /await Promise\.resolve\(onRefresh\?\.\(\)\)\.catch\(\(\) => \{\}\);/);
    });

    it('on POST failure, shows toast.error with the error message (or a fallback) and stops', () => {
      assert.match(
        src,
        /catch\s*\(err\)\s*\{[\s\S]{0,160}?toast\.error\(err\.message \|\| ui\(['"]networkError['"]\)\);\s*return;/,
      );
    });

    // The ETP-5063 effect still exists and still serves GoodsShipmentConfirmModal's
    // onConfirmed — only the fully-invoiced branch stopped using it.
    it('keeps the setInvoiceResult effect alive for the modal path', () => {
      assert.match(src, /if \(invoiceResult && !invoiceResult\.invoice\?\.id\) \{/);
    });

    it('depends on onRefresh in the useCallback dependency array', () => {
      assert.match(src, /\}, \[confirmDocAction\.execute, recordId, ui, onRefresh\]\);/);
    });

    // ETP-5265 QA follow-up — QA explicitly rejected the floating "processing" card:
    // "debería estar en el botón de Procesar el spinner (como al procesar una factura)".
    // The button-side spinner is covered in DetailView.saveButtons.vitest.jsx.
    it('shows NO loading toast — the in-flight feedback is the Confirm button spinner', () => {
      assert.doesNotMatch(src, /toast\.loading/);
      assert.doesNotMatch(src, /toast\.dismiss/);
    });

    it('guards against re-entrant double-confirm via a ref', () => {
      assert.match(src, /confirmingFullyInvoicedRef\.current/);
    });

    it('GoodsShipmentConfirmModal now only renders for the NOT-fully-invoiced flow', () => {
      assert.match(src, /\{!isCompleted && !isFullyInvoiced && showConfirmModal && \(/);
    });
  });

  // ETP-4717 (Pair 2 — P2) — regression lock-in, relocated by ETP-5260. Unlike
  // sales-order, purchase-order, sales-invoice, and sales-quotation (fixed
  // separately), this window already gated the Send button correctly
  // (Completed/CO only). That gate now lives in GoodsShipmentSecondaryActions
  // (`showSend={isCompleted}`) — see
  // artifacts/goods-shipment/custom/__tests__/GoodsShipmentSecondaryActions.test.js,
  // which is what now locks in "not isDraft || isCompleted" so a future
  // shared-logic refactor cannot silently regress it.

  // ETP-4702 — regression guard. This component used to render its own private
  // kebab popover (menuOpen/menuRef state, previously ~lines 207-237) as a SECOND,
  // independent kebab button rendered next to the generic moreMenuContent kebab
  // (Post/Unpost + the new GoodsShipmentMoreMenu "Download PDF" item). That
  // duplicated the kebab menu on completed shipments. The private popover was
  // removed outright — this component must never regrow it.
  describe('no private kebab-menu popover (ETP-4702)', () => {
    it('has no private kebab-menu open/close state', () => {
      assert.doesNotMatch(src, /menuOpen/);
    });

    it('has no ref for a private kebab popover', () => {
      assert.doesNotMatch(src, /menuRef/);
    });

    it('has no standalone kebab trigger character', () => {
      assert.doesNotMatch(src, new RegExp(String.fromCharCode(0x22ee)));
    });

  });

  // ETP-4729 — print unification. The private text "Imprimir" button
  // (handlePrint + a direct generateShipmentPdf(...) call) that used to live in
  // this component was removed: print is now served exclusively by the generic
  // icon-only print flow in DetailView.jsx / DocumentPrintDrawer.jsx. This
  // component must never regrow its own handlePrint/print button — that would
  // duplicate the print entry point alongside the generic one.
  describe('no private text print button (ETP-4729 — unified onto the generic print icon)', () => {
    it('has no local handlePrint handler', () => {
      assert.doesNotMatch(src, /const handlePrint\s*=/);
    });

    it('does not import or call generateShipmentPdf directly (that lives in useShipmentPdf, consumed only by GoodsShipmentMoreMenu\'s Download PDF item)', () => {
      assert.doesNotMatch(src, /import\s+.*generateShipmentPdf.*from/);
      assert.doesNotMatch(src, /generateShipmentPdf\(/);
    });
  });

  // ETP-4779 — QA regression: the "Documentos" related-docs section on Sales
  // Goods Shipment (Albarán de Venta) required a manual page reload to show a
  // newly generated Sales Invoice. Root cause: this component discarded the
  // `onRefresh` prop DetailView's topbarRight slot already passes (see
  // DetailView.jsx TopbarRightComponent), calling a full
  // `window.location.reload()` instead.
  describe('partial refresh instead of full page reload (ETP-4779)', () => {
    it('accepts an onRefresh prop', () => {
      assert.match(src, /export default function GoodsShipmentActions\(\{[^}]*onRefresh[^}]*\}\)/);
    });

    it('never calls window.location.reload', () => {
      assert.doesNotMatch(src, /window\.location\.reload/);
    });

    it('calls onRefresh (not a reload) when closing the invoice-result modal, unless the user navigated away', () => {
      assert.match(
        src,
        /setInvoiceResult\(null\);\s*setTimeout\(\(\) => \{\s*[\s\S]*?if\s*\(!resultNavigatedRef\.current\)\s*onRefresh\?\.\(\);/,
      );
    });

    it('calls onRefresh (not a reload) as the ReturnWizard onSuccess fallback when the created return has no id to navigate to', () => {
      assert.match(
        src,
        /if\s*\(returnData\?\.id\)\s*\{\s*navigate\(`\/return-material-receipt\/\$\{returnData\.id\}`\);\s*\}\s*else\s*\{\s*[\s\S]*?onRefresh\?\.\(\);\s*\}/,
      );
    });
  });

  // ETP-5333 — regression guard. handleCreateInvoice used to be called from an
  // inline onConfirm that closed the modal (setShowInvoiceConfirm(false))
  // SYNCHRONOUSLY on click, before the request even started — no loading
  // feedback, then a second (result) modal popped up once the request
  // resolved. The fix moves setShowInvoiceConfirm(false) inside
  // handleCreateInvoice's own SUCCESS branch, right before setInvoiceResult,
  // and passes `loading={creatingInvoice}` straight through to
  // CreateInvoiceConfirmModal so it can show its own spinner/label while the
  // modal stays mounted.
  describe('handleCreateInvoice — modal closes only on success, right before setInvoiceResult (ETP-5333)', () => {
    // Adjacency is asserted through assertAdjacentStatements, which strips
    // comments first: the property under test is "no intervening STATEMENT",
    // not "no intervening CHARACTERS". The raw `\s*` form of this regex is the
    // exact mirror of the one ETP-5381 broke in GoodsReceiptActions.test.js by
    // adding an explanatory comment; here it survived only because the comment
    // landed two lines further down, inside the object literal. A real
    // statement between the two calls still fails.
    it('calls setShowInvoiceConfirm(false) immediately before setInvoiceResult inside the success path', () => {
      assertAdjacentStatements(
        src,
        [/setShowInvoiceConfirm\(false\);/, /setInvoiceResult\(\{/],
        'expected setShowInvoiceConfirm(false) to run right before setInvoiceResult({...}) on success',
      );
    });

    it('does NOT close the modal inside the catch (error) branch — it must stay open on failure so the user can retry', () => {
      const handlerBlock = src.match(/const handleCreateInvoice = async[\s\S]*?\n  \};/);
      assert.ok(handlerBlock, 'expected the handleCreateInvoice function body');
      const catchBlock = handlerBlock[0].match(/\} catch \(err\) \{[\s\S]*?\} finally \{/);
      assert.ok(catchBlock, 'expected a catch block inside handleCreateInvoice');
      assert.doesNotMatch(catchBlock[0], /setShowInvoiceConfirm\(false\)/);
      assert.match(catchBlock[0], /toast\.error\(/);
    });

    it('guards re-entrant calls with the creatingInvoice flag before doing anything else', () => {
      assert.match(
        src,
        /const handleCreateInvoice = async \(priceListId\) => \{\s*if \(creatingInvoice\) return;\s*setCreatingInvoice\(true\);/,
      );
    });

    it('passes loading={creatingInvoice} to CreateInvoiceConfirmModal', () => {
      assert.match(src, /<CreateInvoiceConfirmModal[\s\S]*?loading=\{creatingInvoice\}[\s\S]*?\/>/);
    });

    it('always resets creatingInvoice in a finally block, regardless of success or failure', () => {
      const handlerBlock = src.match(/const handleCreateInvoice = async[\s\S]*?\n  \};/);
      assert.ok(handlerBlock, 'expected the handleCreateInvoice function body');
      assert.match(handlerBlock[0], /\} finally \{\s*setCreatingInvoice\(false\);\s*\}/);
    });
  });
});
