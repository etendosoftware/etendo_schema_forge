import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useRowDelete } from '@/hooks/useRowDelete';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { useRowEmailModal } from './useRowEmailModal.jsx';

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
  ...pageProps
}) {
  // ETP-4857 — reads the sessionStorage result BulkDocumentAction leaves behind
  // before its window.location.reload(); without this the toast only shows up
  // the next time some other window that calls this hook happens to mount.
  useBulkActionToast();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [cloneTargets, setCloneTargets] = useState(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

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
  }), [navigate, windowName, requestDelete, duplicateAction, emailAction, onRowEmail]);

  if (recordId) {
    return (
      <PageComponent
        windowName={windowName}
        recordId={recordId}
        apiBaseUrl={apiBaseUrl}
        token={token}
        autoSaveOnBlur={true}
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
    </>
  );
}
