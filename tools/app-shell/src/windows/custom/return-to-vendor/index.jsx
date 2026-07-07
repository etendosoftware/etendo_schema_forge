import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMenuLabel } from '@/i18n';
import { useRowDelete } from '@/hooks/useRowDelete';
import { useRowEmailModal } from '../shared/useRowEmailModal.jsx';
import { useReturnToVendorOrderPdf } from './useReturnToVendorOrderPdf.js';
import ReturnToVendorActions from './ReturnToVendorActions.jsx';
import ReturnToVendorPreview from './ReturnToVendorPreview.jsx';
import HeaderPage from '@generated/return-to-vendor/generated/web/return-to-vendor/HeaderPage';

/* eslint-disable react/prop-types */

/**
 * Custom entry point for the return-to-vendor (C_Order purchase return) window.
 *
 * ETP-4372 Part 2 — enables the 4 document-email access points WITH PDF preview:
 *   1. Form-view topbar Send envelope  → ReturnToVendorActions (topbarRight)
 *   2. Side-panel preview Send + PDF   → ReturnToVendorPreview (renderPreview)
 *   3. Row-hover email envelope + PDF  → useRowEmailModal (rowQuickActions.onEmail)
 *   4. Preview "Send" action button    → ReturnToVendorPreview action buttons
 *
 * Routing mirrors sales-invoice:
 *   - recordId present → generated HeaderPage (detail) + topbarRight
 *   - no recordId      → generated HeaderPage (list) + rowQuickActions + renderPreview
 */
export default function ReturnToVendorWindow(props) {
  const { recordId, token, apiBaseUrl, windowName } = props;
  const navigate = useNavigate();
  const tMenu = useMenuLabel();
  const [refreshKey, setRefreshKey] = useState(0);

  const { onEmail, emailModalPortal } = useRowEmailModal({
    usePdf: useReturnToVendorOrderPdf,
    apiBaseUrl,
    token,
    windowName,
    documentType: tMenu('Return to Vendor'),
  });

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'header',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    editMode: 'navigate',
    statusField: 'documentStatus',
    documentPreview: true,
    actions: {
      edit: { show: true },
      duplicate: { show: true },
      email: { show: true },
      delete: { show: true },
    },
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onEmail,
    onDelete: requestDelete,
  }), [navigate, windowName, onEmail, requestDelete]);

  if (recordId) {
    return (
      <HeaderPage
        {...props}
        topbarRight={ReturnToVendorActions}
        data-testid="HeaderPage__rtv" />
    );
  }

  return (
    <>
      <HeaderPage
        {...props}
        rowQuickActions={rowQuickActions}
        refreshTrigger={refreshKey}
        renderPreview={({ row, onClose, onEdit }) => (
          <ReturnToVendorPreview
            order={row}
            token={token}
            apiBaseUrl={apiBaseUrl}
            windowName={windowName}
            onClose={onClose}
            onEdit={onEdit}
            data-testid="ReturnToVendorPreview__rtv" />
        )}
        data-testid="HeaderPage__rtv" />
      {deleteDialog}
      {emailModalPortal}
    </>
  );
}
