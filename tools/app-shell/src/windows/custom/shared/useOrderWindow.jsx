import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { useRowDelete } from '@/hooks/useRowDelete';
import { fetchOptionalJson } from './pdfUtils.js';
import { useSavedPreviewRecord } from './useSavedPreviewRecord.js';
import OrderPreview from './OrderPreview.jsx';

export function useOrderWindow({
  windowName,
  token,
  apiBaseUrl,
  specName,
  deliveryKey,
  manageLabelKeys,
  confirmLabelKey,
  headers,
  ConfirmModal,
  ConfirmResultModal,
  ManageDocsLauncher,
  setCloneTargets,
  showReactivate = false,
}) {
  useBulkActionToast();
  const ui = useUI();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmRow, setConfirmRow] = useState(null);
  const [confirmedDocs, setConfirmedDocs] = useState(null);
  const [manageRow, setManageRow] = useState(null);

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'header',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const { effectiveRecord, clearSavedRecord } = useSavedPreviewRecord();

  const renderPreview = useCallback(({ row, onClose, onEdit }) => (
    <OrderPreview
      order={row}
      token={token}
      apiBaseUrl={apiBaseUrl}
      windowName={windowName}
      specName={specName}
      onClose={onClose}
      onEdit={onEdit}
      data-testid="OrderPreview__4b313b" />
  ), [token, apiBaseUrl, windowName, specName]);

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    editMode: 'navigate',
    statusField: 'documentStatus',
    actions: {
      edit: { show: true },
      duplicate: { show: true },
      delete: { show: true },
    },
    documentPreview: true,
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onClone: (row) => setCloneTargets([row]),
    onDelete: requestDelete,
    menuActions: ({ row, status }) => {
      const delivery = Number(row?.[deliveryKey] ?? 100);
      const invoice  = Number(row?.invoiceStatus  ?? 100);
      const needsPrimary = status === 'CO' && delivery < 100;
      const needsInvoice = status === 'CO' && invoice  < 100;
      let manageLabelKey = null;
      if      (needsPrimary && needsInvoice) manageLabelKey = manageLabelKeys.both;
      else if (needsPrimary)                 manageLabelKey = manageLabelKeys.primary;
      else if (needsInvoice)                 manageLabelKey = manageLabelKeys.invoice;
      return [
        {
          key: 'confirm',
          label: ui(confirmLabelKey),
          visible: status === 'DR',
          onClick: async ({ row: r }) => {
            const base = apiBaseUrl.replace(/\/[^/]+$/, '');
            const docCurrency = r['currency$_identifier'] || r.currency;
            if (docCurrency && r.orderDate) {
              try {
                const session = await fetchOptionalJson(`${base}/session`, token);
                const orgCurrency = session?.organization?.['currency$_identifier'];
                const orgCurrencyId = session?.organization?.currency;
                if (orgCurrency && docCurrency !== orgCurrency) {
                  const fromCurrency = r.currency || docCurrency;
                  const toCurrency = orgCurrencyId ?? orgCurrency;
                  const rateData = await fetchOptionalJson(
                    `${base}/validate-exchange-rate?fromCurrency=${encodeURIComponent(fromCurrency)}&toCurrency=${encodeURIComponent(toCurrency)}&date=${encodeURIComponent(r.orderDate)}`,
                    token,
                  );
                  if (rateData && !rateData.hasRate) {
                    toast.error(ui('noExchangeRateAvailable'));
                    return;
                  }
                }
              } catch { /* non-fatal — allow confirmation to proceed */ }
            }
            setConfirmRow(r);
          },
        },
        {
          key: 'manage',
          label: manageLabelKey ? ui(manageLabelKey) : '',
          visible: !!manageLabelKey,
          onClick: ({ row: r }) => setManageRow(r),
        },
        ...(showReactivate ? [{
          key: 'reactivate',
          label: ui('reactivate'),
          labelKey: 'reactivate',
          successKey: 'reactivated',
          documentAction: 'RE',
          visible: status === 'CO' && !row?.hasLinkedDocuments,
        }] : []),
      ];
    },
    onMenuActionExecuted: (action) => {
      if (action.documentAction) setRefreshKey(k => k + 1);
    },
  }), [navigate, windowName, requestDelete, ui, deliveryKey, manageLabelKeys, confirmLabelKey, setCloneTargets, showReactivate]);

  const confirmPortal = confirmRow && !confirmedDocs ? createPortal(
    <ConfirmModal
      orderId={confirmRow.id}
      data={confirmRow}
      apiBaseUrl={apiBaseUrl}
      headers={headers}
      onClose={() => setConfirmRow(null)}
      onConfirmed={(docs) => setConfirmedDocs(docs)}
      data-testid="ConfirmModal__4b313b" />,
    document.body,
  ) : null;

  const manageLauncher = manageRow ? (
    <ManageDocsLauncher
      orderId={manageRow.id}
      data={manageRow}
      apiBaseUrl={apiBaseUrl}
      token={token}
      onClose={() => setManageRow(null)}
      onCreated={() => { setManageRow(null); setRefreshKey(k => k + 1); }}
      data-testid="ManageDocsLauncher__4b313b" />
  ) : null;

  const confirmResultPortal = confirmedDocs ? createPortal(
    <ConfirmResultModal
      title={ui('soConfirmedTitle')}
      docs={[
        confirmedDocs.shipment?.id && { type: 'salida', num: confirmedDocs.shipment.documentNo, amount: confirmedDocs.shipment.amount, route: `/goods-shipment/${confirmedDocs.shipment.id}` },
        confirmedDocs.invoice?.id  && { type: 'facturaVenta', num: confirmedDocs.invoice.documentNo, amount: confirmedDocs.invoice.amount, route: `/sales-invoice/${confirmedDocs.invoice.id}` },
      ].filter(Boolean)}
      currency={confirmRow?.['currency$_identifier'] || ''}
      navigate={navigate}
      onClose={() => {
        setConfirmedDocs(null);
        setConfirmRow(null);
        setRefreshKey(k => k + 1);
      }}
      data-testid="ConfirmResultModal__4b313b" />,
    document.body,
  ) : null;

  return {
    refreshKey,
    setRefreshKey,
    renderPreview,
    rowQuickActions,
    effectiveRecord,
    clearSavedRecord,
    deleteDialog,
    confirmPortal,
    manageLauncher,
    confirmResultPortal,
  };
}
