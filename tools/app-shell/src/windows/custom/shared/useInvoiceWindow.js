import { useCallback } from 'react';
import { SEND_VISIBLE_WHEN_CONFIRMED } from './sendActionVisibility.js';

export function getInvoiceDraftMode(ui, options = {}) {
  const { showVerifactuProcessingModal = false } = options;
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
  };
}

export function buildInvoiceRowQuickActions(navigate, windowName, setCloneTargets, setEmailRow, requestDelete, options = {}) {
  const { showEmail = true, onRefresh } = options;
  return {
    enabled: true,
    editMode: 'navigate',
    documentPreview: true,
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
    menuActions: ({ row }) => {
      const isPosted = row?.posted === 'Y' || row?.posted === true;
      const isProcessed = row?.processed === 'Y' || row?.processed === true;
      if (isPosted || !isProcessed) return [];
      return [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }];
    },
    onMenuActionExecuted: (action) => {
      if (action.neoAction) onRefresh?.();
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
