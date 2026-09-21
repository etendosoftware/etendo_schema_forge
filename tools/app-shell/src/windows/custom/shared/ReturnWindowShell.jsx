import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useRowDelete } from '@/hooks/useRowDelete';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { useRowEmailModal } from './useRowEmailModal.jsx';
import { buildDocumentRowQuickActionsPostMenu } from './buildDocumentRowQuickActions.js';
import { useRowConfirmAction } from './useRowConfirmAction.jsx';
import { useUI } from '@/i18n';

import { buildHeaders } from '@/auth/api.js';
export default function ReturnWindowShell({
  windowName, recordId, apiBaseUrl, token,
  PageComponent,
  renderPreview,
  entity,
  headerEntity,
  routePrefix,
  duplicateAction,
  // ETP-4718 — optional per-window row-hover "Enviar" (send-email) wiring.
  // Shape: { usePdf, documentType, visibleWhen }. When omitted, the row Email
  // action stays exactly as before (icon gated only by `documentPreview`, no
  // onEmail handler) — existing callers of this shell are unaffected.
  emailAction,
  // ETP-5378 — optional per-window row-hover "Confirmar" wiring, opening the SAME popup
  // ConfirmWithCreditButtonBase shows in the form
  // (`return-{material-receipt,to-vendor-shipment}/ConfirmWithCreditButton.jsx`), so
  // confirming from the grid behaves identically to confirming from the form. Shape:
  // { ConfirmModal, specName, entityName, confirmedTitleKey, invoiceResultTitleKey,
  //   invoiceDocType, invoiceRoute }. Omitted, the row kebab has no Confirmar entry —
  // unchanged for a hypothetical future shell consumer with no confirm flow of its own.
  confirmAction,
  ...pageProps
}) {
  // ETP-4857 — reads the sessionStorage result BulkDocumentAction leaves behind
  // before its window.location.reload(); without this the toast only shows up
  // the next time some other window that calls this hook happens to mount.
  useBulkActionToast();
  const ui = useUI();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [cloneTargets, setCloneTargets] = useState(null);

  const headers = useMemo(() => (buildHeaders(token)), [token]);

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity,
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const { onEmail: onRowEmail, emailModalPortal } = useRowEmailModal({
    usePdf: emailAction?.usePdf,
    apiBaseUrl,
    token,
    windowName,
    documentType: emailAction?.documentType,
  });

  // ETP-5378 — hook is always called (Rules of Hooks); its menu entry only ever reaches
  // the kebab when a caller supplies `confirmAction` (guarded below). `false` matches
  // BOTH return windows' own form: ConfirmWithCreditButtonBase always opens its popup on
  // a draft, degrading the "create invoice" toggle once fully invoiced rather than
  // skipping the popup outright (unlike goods-shipment/goods-receipt's ETP-5265 shortcut).
  const { confirmMenuAction, confirmPortal } = useRowConfirmAction({
    specName: confirmAction?.specName,
    entityName: confirmAction?.entityName,
    apiBaseUrl,
    token,
    ConfirmModal: confirmAction?.ConfirmModal,
    confirmedTitleKey: confirmAction?.confirmedTitleKey,
    invoiceResultTitleKey: confirmAction?.invoiceResultTitleKey,
    invoiceDocType: confirmAction?.invoiceDocType,
    invoiceRoute: confirmAction?.invoiceRoute,
    skipPopupWhenFullyInvoiced: false,
    onRefresh: () => setRefreshKey(k => k + 1),
  });

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    editMode: 'navigate',
    documentPreview: true,
    statusField: 'documentStatus',
    actions: {
      edit: { show: true },
      duplicate: duplicateAction || { show: true },
      email: { show: !!emailAction, visibleWhen: emailAction?.visibleWhen },
      delete: { show: true },
    },
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onDelete: requestDelete,
    onClone: (row) => setCloneTargets([row]),
    onEmail: emailAction ? onRowEmail : undefined,
    // ETP-5378 — both return windows had no `menuActions` at all, so RowQuickActions
    // never rendered the kebab and Contabilizar/Descontabilizar were unreachable from
    // the grid, unlike their goods-shipment/goods-receipt siblings. Same posted/processed
    // gate as every other document window; `unpost` is opted in because both windows now
    // declare it in their decisions.json too.
    ...buildDocumentRowQuickActionsPostMenu({
      ui,
      onRefresh: () => setRefreshKey(k => k + 1),
      includeUnpost: true,
      extraMenuActions: confirmAction ? confirmMenuAction : null,
    }),
  }), [
    navigate, windowName, requestDelete, duplicateAction, emailAction, onRowEmail, ui,
    confirmAction, confirmMenuAction,
  ]);

  if (recordId) {
    return (
      <PageComponent
        windowName={windowName}
        recordId={recordId}
        apiBaseUrl={apiBaseUrl}
        token={token}
        autoSaveOnBlur={true}
        /* ETP-4933: both return windows put their own Confirm button in the topbarRight
           slot, so Save must not render as a second primary. Set here rather than in each
           window's index.jsx because the slot is what this shell's windows have in common —
           a future shell consumer without a Confirm button should drop this, not inherit it. */
        hasExternalPrimaryAction
        {...pageProps}
        data-testid="PageComponent__3ea846" />
    );
  }

  return (
    <>
      <PageComponent
        windowName={windowName}
        apiBaseUrl={apiBaseUrl}
        token={token}
        rowQuickActions={rowQuickActions}
        refreshTrigger={refreshKey}
        renderPreview={renderPreview}
        {...pageProps}
        data-testid="PageComponent__3ea846" />
      {deleteDialog}
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          headerEntity={headerEntity}
          routePrefix={routePrefix}
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
          data-testid="CloneOrderModal__3ea846" />,
        document.body,
      )}
      {emailModalPortal}
      {confirmAction && confirmPortal}
    </>
  );
}
