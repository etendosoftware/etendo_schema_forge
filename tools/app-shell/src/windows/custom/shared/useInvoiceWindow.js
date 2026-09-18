import { useCallback } from 'react';
import { toast } from 'sonner';
// ETP-5209 follow-up — relative import, not the `@/` alias: this module is loaded
// directly by plain `node --test` via useInvoiceWindow.test.js's real `import`
// (Vite's alias resolution is unavailable there), and backendErrors.js is a
// dependency-free leaf module, so the relative path costs nothing.
import { translateBackendError } from '../../../lib/backendErrors.js';
import { SEND_VISIBLE_WHEN_CONFIRMED } from './sendActionVisibility.js';

export function getInvoiceDraftMode(ui, options = {}) {
  const { showVerifactuProcessingModal = false, keepSaveWhenCompletedFields = [] } = options;
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
    //   completed + posted      → Reactivate only (Post would be a no-op; the
    //                             reactivation unposts first via preUnpost)
    //   draft                   → neither, so the kebab does not render at all
    // Order matches decisions.json → window.menuActions (reactivate first).
    menuActions: ({ row }) => {
      const isPosted = row?.posted === 'Y' || row?.posted === true;
      const isProcessed = row?.processed === 'Y' || row?.processed === true;
      const isCompleted = row?.documentStatus === 'CO';
      return [
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
      ];
    },
    // ETP-5209 follow-up — RowQuickActions deliberately never shows a toast itself
    // ("toast/snackbar is the host's responsibility"); this was the missing host-side
    // half for the row-kebab Post action, mirroring DetailMoreActionsMenu's
    // runNeoMenuAction for the exact same neoAction shape.
    onMenuActionExecuted: (action, result) => {
      // ETP-5378 — `reactivate` is a documentAction, not a neoAction; gating on neoAction
      // alone silently swallowed its toast and skipped the list refresh.
      if (!action.neoAction && !action.documentAction) return;
      if (result?.success === false) {
        toast.error(translateBackendError(result?.message, ui) || ui?.('actionFailed'));
      } else {
        toast.success((action.successKey ? ui?.(action.successKey) : action.successMessage) || ui?.('actionCompleted'));
      }
      onRefresh?.();
    },
  };
}

export function useClearSavedRecord(setSavedRecord, location, navigate) {
  return useCallback(() => {
    setSavedRecord(null);
    // Clear navigation state so the modal doesn't reappear on browser back/forward
    if (location.state?.savedRecord) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [setSavedRecord, location, navigate]);
}
