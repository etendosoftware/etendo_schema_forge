import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import GeneratedApp from '@generated/sales-order/generated/web/sales-order/index.jsx';
import HeaderTable from '@generated/sales-order/generated/web/sales-order/HeaderTable';
import OrderReactivateBulkAction from '@generated/sales-order/custom/OrderReactivateBulkAction';
import BulkOrderMoreMenu from '@generated/sales-order/custom/BulkOrderMoreMenu';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
import { ConfirmModal, ManageDocsLauncher } from '@generated/sales-order/custom/OrderCreateInvoice';
import { ConfirmResultModal } from '@/components/contract-ui';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';
import { useMenuLabel } from '@/i18n';
import { useOrderWindow } from '../shared/useOrderWindow.jsx';
import { useOrderPdf } from '../shared/useOrderPdf.js';
import { useTaxSifLineRowActions } from '../shared/useTaxSifLineRowActions.jsx';

// Mirrors artifacts/sales-order/decisions.json → window.lineTaxSifTrigger (ETP-4888
// point 5 follow-up round, docs/decisions-reference.md). `DetailView`'s `lineCellBadges`
// prop is a plain generic passthrough with NO generate-frontend.js wiring
// (schema_forge_core is out of reach for this window-specific feature) — same convention
// sales-invoice/purchase-invoice's index.jsx already uses. `GeneratedApp` below (this
// window's `@generated/sales-order/generated/web/sales-order/index.jsx`) spreads its own
// `...rest` straight into `HeaderPage`, which itself spreads `{...props}` into
// `DetailView`, so passing `lineCellBadges` here reaches the line grid unchanged.
// Keep this constant in sync with the decisions.json flag.
const LINE_TAX_SIF_TRIGGER_ENABLED = true;

const LIST_COLUMNS = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date', dot: false, required: true },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', required: true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount', required: true },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent', label: 'Invoice Status' },
  { key: 'deliveryStatus', column: 'DeliveryStatus', type: 'percent', label: 'Shipment Status' },
];

function CustomHeaderTable(props) {
  return <HeaderTable columns={LIST_COLUMNS} {...props} data-testid="HeaderTable__6339e4" />;
}

const LABEL_OVERRIDES = {
  es_ES: {
    C_BPartner_ID: 'Contacto',
    DeliveryStatus: 'Estado de entrega',
    InvoiceStatus: 'Estado de facturación',
  },
  en_US: {
    C_BPartner_ID: 'Contact',
    DeliveryStatus: 'Delivery Status',
    InvoiceStatus: 'Invoicing Status',
  },
};

const draftModeWithModal = {
  enabled: true,
  processField: 'documentAction',
  processValue: 'CO',
  label: 'soConfirmBtn',
  disableWhenEmpty: true,
  onConfirm: () => window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal')),
};

const SO_MANAGE_LABELS = {
  both: 'soManageShipmentAndInvoice',
  primary: 'soManageShipment',
  invoice: 'soManageInvoice',
};

export default function SalesOrderWindow({ windowName, recordId, token, apiBaseUrl, ...rest }) {
  const [cloneTargets, setCloneTargets] = useState(null);
  const tMenu = useMenuLabel();

  const { headers, createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'sale' });

  const {
    refreshKey, setRefreshKey,
    renderPreview, rowQuickActions,
    effectiveRecord, clearSavedRecord,
    deleteDialog, confirmPortal, confirmResultPortal, manageLauncher,
    emailModalPortal,
  } = useOrderWindow({
    windowName, token, apiBaseUrl,
    specName: 'sales-order',
    deliveryKey: 'deliveryStatus',
    manageLabelKeys: SO_MANAGE_LABELS,
    confirmLabelKey: 'soConfirmBtn',
    headers,
    ConfirmModal,
    ConfirmResultModal,
    ManageDocsLauncher,
    setCloneTargets,
    showReactivate: true,
    usePdf: useOrderPdf,
    documentType: tMenu('Sales Order'),
  });

  // ETP-4888 point 5 follow-up — see LINE_TAX_SIF_TRIGGER_ENABLED above for the
  // decisions.json mirror note.
  const { cellBadges: taxSifCellBadges, modal: taxSifModal } = useTaxSifLineRowActions({
    apiBaseUrl, token, enabled: LINE_TAX_SIF_TRIGGER_ENABLED, recordId, windowCategory: 'sales', specName: 'sales-order',
  });

  // ETP-4520 — this custom window's own hand-rolled list view (below) never delegated
  // to GeneratedApp, so it never picked up the generated HeaderPage's access-tier guard.
  // Checked once here, before either branch, so both list and detail are covered.
  const windowAccessTier = useWindowAccess('143');
  // ETP-4520 — mirrors buildWindowAccessWiring's effectiveWindow: the hand-rolled
  // ListView below never picked up the read-only tier either, unlike GeneratedApp
  // (which already forces window.readOnly internally for the detail branch).
  // Computed unconditionally, before the early return below, so hook order stays
  // stable across renders regardless of windowAccessTier.
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(rest.window || {}), readOnly: true } : rest.window
  ), [windowAccessTier, rest.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="143" data-testid="WindowAccessGuard__6339e4" />;
  }

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <GeneratedApp
          windowName={windowName}
          recordId={recordId}
          token={token}
          apiBaseUrl={apiBaseUrl}
          draftMode={draftModeWithModal}
          linesEmptyState={LinesEmptyState}
          {...rest}
          lineCellBadges={taxSifCellBadges}
          data-testid="GeneratedApp__6339e4" />
        {contactPortal}
        {taxSifModal}
      </CreateContactContext.Provider>
    );
  }

  return (
    <>
      <ListView
        entity="header"
        Table={CustomHeaderTable}
        entityLabel="Sales Order"
        windowName={windowName}
        breadcrumb="Sales / Sales Order"
        labelOverrides={LABEL_OVERRIDES}
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        rowQuickActions={rowQuickActions}
        token={token}
        apiBaseUrl={apiBaseUrl}
        hideLink
        bulkActions={(ctx) => (
          <>
            <BulkOrderMoreMenu {...ctx} data-testid="BulkOrderMoreMenu__6339e4" />
            <OrderReactivateBulkAction {...ctx} data-testid="OrderReactivateBulkAction__6339e4" />
            <CopyLinkButton
              selectedRows={ctx.selectedRows}
              windowName={ctx.windowName}
              data-testid="CopyLinkButton__6339e4" />
          </>
        )}
        dateFilterKey="orderDate"
        refreshTrigger={refreshKey}
        renderPreview={renderPreview}
        externalPreviewRow={effectiveRecord}
        onExternalPreviewClose={clearSavedRecord}
        {...rest}
        window={effectiveWindow}
        data-testid="ListView__6339e4" />
      {deleteDialog}
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          routePrefix="/sales-order/"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
          data-testid="CloneOrderModal__6339e4" />,
        document.body,
      )}
      {confirmPortal}
      {manageLauncher}
      {confirmResultPortal}
      {emailModalPortal}
    </>
  );
}
