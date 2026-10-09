import { useCallback } from 'react';
// ETP-5209 follow-up — relative imports, not the `@/` alias: this module is loaded
// directly by plain `node --test` via useInvoiceWindow.test.js's real `import`
// (Vite's alias resolution is unavailable there), and preUnpost.js is a
// dependency-free leaf module, so the relative path costs nothing.
import { isPosted as isRowPosted } from '../../../lib/preUnpost.js';
import { SEND_VISIBLE_WHEN_CONFIRMED } from './sendActionVisibility.js';
import { buildMenuActionExecutedHandler } from './buildDocumentRowQuickActions.js';

export function getInvoiceDraftMode(ui, options = {}) {
  const { showVerifactuProcessingModal = false, keepSaveWhenCompletedFields = [], editableLineFieldsWhenCompleted = [], afterProcess } = options;
  return {
    enabled: true,
    processField: 'documentAction',
    processValue: 'CO',
    label: ui('confirm'),
    disableWhenEmpty: true,
    // Opt-in loading modal for the ~8s synchronous GenerateRF (hash + AEAT
    // submission) that runs on Confirm when Verifactu is active for the org.
    // Absent/null when the caller doesn't pass showVerifactuProcessingModal,
    // so any other consumer of getInvoiceDraftMode (e.g. purchase-invoice,
    // which never has Verifactu) is unaffected.
    processingModal: showVerifactuProcessingModal
      ? { body: ui('fiscal.verifactu.processing.body') }
      : null,
    // ETP-4839: only purchase-invoice opts in (keeps "Save" visible, "Confirm"
    // NEVER reappears, once the invoice is completed — see decisions.json ->
    // window.draftMode.keepSaveWhenCompletedFields). Save is then enabled only
    // while every dirty header field is named in this array (e.g.
    // ['orderReference']) — see saveActions.jsx's buildCompletedFieldsGate.
    // Omitted entirely (not even as []) when the caller passes no array or an
    // empty one, so sales-invoice's draftMode object — and its tests/snapshots
    // — stay byte-identical to before.
    ...(Array.isArray(keepSaveWhenCompletedFields) && keepSaveWhenCompletedFields.length > 0
      ? { keepSaveWhenCompletedFields }
      : {}),
    // ETP-5692 — line fields that stay editable/savable on a completed invoice (the line
    // accounting dimensions, editable again once unposted). Omitted when empty, like above.
    ...(Array.isArray(editableLineFieldsWhenCompleted) && editableLineFieldsWhenCompleted.length > 0
      ? { editableLineFieldsWhenCompleted }
      : {}),
    // ETP-5576: optional post-Confirm hook (saveActions.jsx → runAfterProcess). The invoice
    // windows pass createFollowUpAfterProcess(...) so a Confirm that leaves a shipment /
    // receipt pending keeps the user on the invoice and opens the follow-up modal. Omitted
    // when not a function, so a caller that passes nothing gets a byte-identical object.
    ...(typeof afterProcess === 'function' ? { afterProcess } : {}),
  };
}

export function buildInvoiceRowQuickActions(navigate, windowName, setCloneTargets, setEmailRow, requestDelete, options = {}) {
  // ETP-5209 follow-up — `ui` is passed in via `options` rather than called here with
  // useUI(), because this is a PLAIN FUNCTION invoked from inside the window component
  // (not a hook itself): calling useUI() here would violate the Rules of Hooks the moment
  // this factory's call graph changes, the same production bug postRowFilter's own
  // `(row, action, ui)` signature was written to avoid (see BulkDocumentAction.jsx).
  const { showEmail = true, onRefresh, ui } = options;
  return {
    enabled: true,
    editMode: 'navigate',
    documentPreview: true,
    // ETP-5378 — lets RowQuickActions resolve the row's document status for the
    // menuActions closure below. Inert for the delete gate, which only consults
    // statusField when a window also sets hideDeleteWhenComplete (see
    // utils/recordActions.js#isDeleteVisibleForRecord); no invoice window does.
    statusField: 'documentStatus',
    actions: {
      edit: { show: true },
      duplicate: { show: true },
      // ETP-4717 — see sendActionVisibility.js
      email: { show: showEmail, ...(showEmail ? { visibleWhen: SEND_VISIBLE_WHEN_CONFIRMED } : {}) },
      delete: { show: true },
    },
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onClone: (row) => setCloneTargets([row]),
    onEmail: showEmail ? (row) => setEmailRow(row) : undefined,
    onDelete: requestDelete,
    // ETP-5209 — Post reachable from the row-hover kebab, without a form-view
    // detour. Mirrors the same posted/processed gate as the form-view kebab
    // (decisions.json → window.menuActions) and the bulk Post action.
    //
    // ETP-5378 — Reactivate joins it, so the row kebab finally matches the
    // form-view kebab the same decisions.json array already describes:
    //   completed + not posted  → Reactivate AND Post
    //   completed + posted      → Reactivate AND Unpost (ETP-5692; the
    //                             reactivation still unposts first via preUnpost)
    //   draft                   → Confirm only (ETP-5378, see the note inside)
    // Order matches decisions.json → window.menuActions (reactivate, post, unpost).
    //
    // ETP-5692 — Unpost is a standalone action again, reversing the ETP-5302 decision:
    // it removes the accounting and leaves the invoice Completed, so accounting-only data
    // (exchange rates, header dimensions) can be corrected and re-posted without
    // reactivating. Offered only on a Completed AND posted invoice (`isPosted` from
    // preUnpost.js: only 'Y'/true count) — the same gate as the form-view kebab
    // (`visibleWhenStatus: "CO"` + `visibleWhenFieldTrue: "posted"`) and the bulk button's
    // invoiceUnpostRowFilter.
    menuActions: ({ row }) => {
      const isPosted = isRowPosted(row);
      const isProcessed = row?.processed === 'Y' || row?.processed === true;
      const isCompleted = row?.documentStatus === 'CO';
      const isDraft = row?.documentStatus === 'DR';
      return [
        // ETP-5378 — Confirmar from the grid, at parity with Pedido de Venta/Compra.
        // Unlike the albarán windows there is no popup to reuse: an invoice's form-view
        // Confirm is DetailView's plain draftMode button, which fires exactly this
        // docAction (see getInvoiceDraftMode above). So the row entry IS the same action,
        // not a reduced version of it.
        ...(isDraft
          ? [{
            key: 'confirm',
            labelKey: 'confirm',
            documentAction: 'CO',
            successKey: 'documentConfirmed',
          }]
          : []),
        ...(isCompleted
          ? [{
            key: 'reactivate',
            labelKey: 'reactivate',
            documentAction: 'RE',
            successKey: 'reactivated',
            // Reactivating a posted invoice must reverse its accounting first, or the
            // backend rejects the bare docAction — same flag the form-view kebab uses.
            preUnpost: true,
          }]
          : []),
        ...(!isPosted && isProcessed
          ? [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }]
          : []),
        ...(isCompleted && isPosted
          ? [{
            key: 'unpost',
            labelKey: 'unpost',
            neoAction: 'unpost',
            successKey: 'documentUnposted',
            destructive: true,
          }]
          : []),
      ];
    },
    // ETP-5209 follow-up — RowQuickActions deliberately never shows a toast itself
    // ("toast/snackbar is the host's responsibility"); this is the host-side half for
    // the row-kebab actions, mirroring DetailMoreActionsMenu's runNeoMenuAction.
    // ETP-5692 — the shared albarán handler instead of a hand-copied one: it is identical
    // except that it forwards `messageKeys`/`messageParams` to translateBackendError, so a
    // row-kebab Unpost rejected for a closed period (`PeriodClosedForUnPosting`) renders in
    // the UI locale, as it already did from the form-view kebab and the bulk bar.
    onMenuActionExecuted: buildMenuActionExecutedHandler(ui, onRefresh),
  };
}

// ETP-5692 — the invoice flavour of BulkDocumentAction's buildUnpostActions/unpostRowFilter
// pair, for the bulk "Descontabilizar" button of sales-invoice and purchase-invoice. An invoice
// is unposted standalone only when it is Completed AND posted (the same gate as the row kebab
// above and the form-view kebab), so a posted invoice in any other status (e.g. voided) is
// skipped too. Kept here, not as a change to the shared pair, so goods-receipt / goods-shipment
// and the other albarán windows keep their posted-only behaviour. Hand-written rather than
// composed from unpostRowFilter because BulkDocumentAction.jsx cannot be loaded by plain
// `node --test` (see the relative-import note at the top of this file).
const invoiceStatusOf = (row) => row?.documentStatus || row?.docStatus;
const isInvoiceUnpostable = (row) => invoiceStatusOf(row) === 'CO' && isRowPosted(row);

export const buildInvoiceUnpostActions = (rows) =>
  (rows.some(isInvoiceUnpostable) ? [{ value: 'unpost', labelKey: 'unpost' }] : []);

export const invoiceUnpostRowFilter = (row, action, ui) => {
  if (action !== 'unpost') return true;
  if (!isRowPosted(row)) return ui('bulkRowNotPosted');
  if (invoiceStatusOf(row) !== 'CO') return ui('bulkRowNotCompleted');
  return true;
};

export function useClearSavedRecord(setSavedRecord, location, navigate) {
  return useCallback(() => {
    setSavedRecord(null);
    // Clear navigation state so the modal doesn't reappear on browser back/forward
    if (location.state?.savedRecord) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [setSavedRecord, location, navigate]);
}
