import { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { useRowDelete } from '@/hooks/useRowDelete';
import { fetchOptionalJson } from './pdfUtils.js';
import { useSavedPreviewRecord } from './useSavedPreviewRecord.js';
import { useRowEmailModal } from './useRowEmailModal.jsx';
import OrderPreview from './OrderPreview.jsx';
import { SEND_VISIBLE_WHEN_CONFIRMED } from './sendActionVisibility.js';
import { readOrderPendingDocs } from './orderPendingDocs.js';

export function useOrderWindow({
  windowName,
  token,
  apiBaseUrl,
  specName,
  // ETP-5295 — `deliveryKey` (the per-window percent column: `deliveryStatus` /
  // `deliveryStatusPurchase`) is gone: the manage decision no longer reads any percent column.
  // See the comment inside `menuActions` below.
  manageLabelKeys,
  confirmLabelKey,
  // ETP-5295 — describe the confirm-flow's default result title, and the shape of the two
  // documents a confirm/manage flow can create, so `confirmResultPortal` below renders the
  // correct type/route/title for whichever window instantiates this hook instead of the
  // sales-order shape hardcoded here previously. Defaults mirror that previous hardcoding
  // (sales-order's shipment/invoice shape) so an existing caller that omits them keeps its
  // current behavior; both purchase-order and sales-order now pass these explicitly.
  confirmedTitleKey = 'soConfirmedTitle',
  primaryDoc = { key: 'shipment', type: 'salida', route: 'goods-shipment' },
  invoiceDoc = { key: 'invoice', type: 'facturaVenta', route: 'sales-invoice' },
  headers,
  ConfirmModal,
  ConfirmResultModal,
  ManageDocsLauncher,
  setCloneTargets,
  showReactivate = false,
  // ETP-4372 — per-window PDF hook + localized document label so the row-hover
  // envelope opens SendDocumentModal WITH a PDF preview (see useRowEmailModal).
  usePdf,
  documentType,
}) {
  useBulkActionToast();
  const ui = useUI();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmRow, setConfirmRow] = useState(null);
  const [confirmedDocs, setConfirmedDocs] = useState(null);
  // ETP-5295 — null = default confirm-flow title (ui(confirmedTitleKey)); an explicit string
  // (always ui('soDocsCreatedTitle') today) overrides it for the manage-docs-created case.
  // Mirrors the pattern already used inside each window's own detail-page component.
  const [confirmedTitle, setConfirmedTitle] = useState(null);
  const [manageRow, setManageRow] = useState(null);

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'header',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const { effectiveRecord, clearSavedRecord } = useSavedPreviewRecord();

  // ETP-4372 — row-hover email envelope with PDF preview. When `usePdf` is not
  // supplied the modal is omitted and ListView keeps its no-preview fallback.
  const { onEmail: onRowEmail, emailModalPortal } = useRowEmailModal({
    usePdf,
    apiBaseUrl,
    token,
    windowName,
    documentType,
  });

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
      // ETP-4717 — see sendActionVisibility.js
      email: { visibleWhen: SEND_VISIBLE_WHEN_CONFIRMED },
    },
    documentPreview: true,
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onClone: (row) => setCloneTargets([row]),
    onEmail: onRowEmail,
    onDelete: requestDelete,
    menuActions: ({ row, status }) => {
      // ETP-5295 — the manage item's visibility AND its label come from the backend
      // annotations `needsPrimaryDoc` / `needsInvoiceDoc`, NOT from the list's
      // `DeliveryStatus` / `InvoiceStatus` percent columns this used to read. Those percents
      // answer a different question than the one the flow actually applies: a DRAFT shipment /
      // receipt / invoice already covers the pending work while the percent still reads < 100.
      // So the kebab offered an item whose `ManageDocsLauncher` then closed silently, hid the
      // item in cases where the detail-form button still offered it, and could promise a section
      // ("... y factura") that the modal would not render. The annotations are computed
      // server-side with the detail form's exact formula (`AbstractOrderHeaderHandler`, the same
      // GET enrichment that already feeds `hasLinkedDocuments` used by `reactivate` below), so
      // all three surfaces now answer "what is still pending?" identically. See
      // `orderPendingDocs.js` for the wire shape.
      //
      // ABSENT annotation (legacy backend, or a spec whose handler does not annotate) reads as
      // NOT pending, so the item is hidden. Deliberate: defaulting to "pending" would reinstate
      // exactly the reported bug — a menu entry that leads nowhere — whereas hiding it only
      // removes a shortcut. The same flow stays reachable from the order's detail page, which
      // derives the answer from the shipments/invoices/lines it fetches itself and therefore
      // never depends on the annotation being present.
      const { needsPrimaryDoc, needsInvoiceDoc } = readOrderPendingDocs(row);
      const needsPrimary = status === 'CO' && needsPrimaryDoc === true;
      const needsInvoice = status === 'CO' && needsInvoiceDoc === true;
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
  }), [navigate, windowName, requestDelete, ui, manageLabelKeys, confirmLabelKey, setCloneTargets, showReactivate, onRowEmail]);

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

  // ETP-5295 — gated on `manageRow && !confirmedDocs`, mirroring `confirmPortal` above: `manageRow`
  // is deliberately NOT cleared by `onCreated` (only by `resetConfirmedState`, on the result
  // popup's own close), because `confirmResultPortal` below reads its `currency` off
  // `confirmRow || manageRow` — clearing it immediately would blank the popup's currency for
  // the manage-docs-created case the instant the docs arrive.
  const manageLauncher = manageRow && !confirmedDocs ? (
    <ManageDocsLauncher
      orderId={manageRow.id}
      data={manageRow}
      apiBaseUrl={apiBaseUrl}
      token={token}
      onClose={() => setManageRow(null)}
      onCreated={(docs) => { setConfirmedTitle(ui('soDocsCreatedTitle')); setConfirmedDocs(docs); }}
      data-testid="ManageDocsLauncher__4b313b" />
  ) : null;

  // ETP-5295 — a confirm/manage flow that created neither document has nothing worth a
  // blocking modal for; only render the result popup when at least one related document
  // actually exists. Mirrors `hasConfirmedDoc` in PurchaseOrderActions.jsx/OrderCreateInvoice.jsx.
  const hasConfirmedDoc = Boolean(confirmedDocs?.[primaryDoc.key]?.id || confirmedDocs?.[invoiceDoc.key]?.id);

  // Closes whichever flow (confirm or manage) opened the popup and bumps refreshKey exactly
  // once, on close — not immediately on creation, same as the pre-existing "confirm" flow.
  const resetConfirmedState = useCallback(() => {
    setConfirmedDocs(null);
    setConfirmRow(null);
    setManageRow(null);
    setConfirmedTitle(null);
    setRefreshKey(k => k + 1);
  }, []);

  // ETP-5295 — when a confirm/manage flow created no related document, skip the modal and
  // communicate success via an auto-dismissing toast instead, matching the UX already used
  // by each window's own detail-page component for this same edge case.
  useEffect(() => {
    if (confirmedDocs && !hasConfirmedDoc) {
      toast.success(confirmedTitle || ui(confirmedTitleKey));
      resetConfirmedState();
    }
  }, [confirmedDocs, hasConfirmedDoc, confirmedTitle, confirmedTitleKey, ui, resetConfirmedState]);

  const confirmResultPortal = confirmedDocs && hasConfirmedDoc ? createPortal(
    <ConfirmResultModal
      title={confirmedTitle || ui(confirmedTitleKey)}
      docs={[
        confirmedDocs?.[primaryDoc.key]?.id && { type: primaryDoc.type, num: confirmedDocs[primaryDoc.key].documentNo, amount: confirmedDocs[primaryDoc.key].amount, route: `/${primaryDoc.route}/${confirmedDocs[primaryDoc.key].id}` },
        // ETP-5381: documentStatus on the invoice entry only — the primary doc (shipment or
        // receipt) is still created as a draft, so it must keep the default Borrador badge.
        confirmedDocs?.[invoiceDoc.key]?.id && { type: invoiceDoc.type, num: confirmedDocs[invoiceDoc.key].documentNo, amount: confirmedDocs[invoiceDoc.key].amount, documentStatus: confirmedDocs[invoiceDoc.key].documentStatus, route: `/${invoiceDoc.route}/${confirmedDocs[invoiceDoc.key].id}` },
      ].filter(Boolean)}
      currency={(confirmRow || manageRow)?.['currency$_identifier'] || ''}
      navigate={navigate}
      onClose={resetConfirmedState}
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
    emailModalPortal,
  };
}
