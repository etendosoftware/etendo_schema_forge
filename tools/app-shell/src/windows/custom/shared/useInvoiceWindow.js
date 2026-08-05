import { useCallback } from 'react';

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
  const { showEmail = true } = options;
  return {
    enabled: true,
    editMode: 'navigate',
    documentPreview: true,
    actions: {
      edit: { show: true },
      duplicate: { show: true },
      // ETP-4717 — this custom window builds rowQuickActions by hand and
      // bypasses the generated contract's rowQuickActions block entirely, so
      // decisions.json's `visibleWhen` never reaches RowQuickActions here.
      // Mirrored by hand to match the Form-view topbar and preview-panel
      // gates: Send only once the invoice is Confirmed (CO). Scoped to
      // callers that actually enable email (sales-invoice) — purchase-invoice
      // passes showEmail: false and stays unaffected.
      email: { show: showEmail, ...(showEmail ? { visibleWhen: "@DocumentStatus@='CO'" } : {}) },
      delete: { show: true },
    },
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onClone: (row) => setCloneTargets([row]),
    onEmail: showEmail ? (row) => setEmailRow(row) : undefined,
    onDelete: requestDelete,
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
