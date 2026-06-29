import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useRowDelete } from '@/hooks/useRowDelete';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';

export default function ReturnWindowShell({
  windowName, recordId, apiBaseUrl, token,
  PageComponent,
  renderPreview,
  entity,
  headerEntity,
  routePrefix,
  duplicateAction,
  ...pageProps
}) {
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

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    editMode: 'navigate',
    documentPreview: true,
    statusField: 'documentStatus',
    hideDeleteWhenComplete: true,
    actions: {
      edit: { show: true },
      duplicate: duplicateAction || { show: true },
      delete: { show: true },
    },
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onDelete: requestDelete,
    onClone: (row) => setCloneTargets([row]),
  }), [navigate, windowName, requestDelete, duplicateAction]);

  if (recordId) {
    return (
      <PageComponent
        windowName={windowName}
        recordId={recordId}
        apiBaseUrl={apiBaseUrl}
        token={token}
        hidePrint={true}
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
    </>
  );
}
