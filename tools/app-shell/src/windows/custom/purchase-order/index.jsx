import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import GeneratedApp from '@generated/purchase-order/generated/web/purchase-order/index.jsx';
import HeaderTable from '@generated/purchase-order/generated/web/purchase-order/HeaderTable';
import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
import BulkPurchaseOrderMoreMenu from '@generated/purchase-order/custom/BulkPurchaseOrderMoreMenu';
import { ConfirmModal as PoConfirmModal, PoConfirmResultModal, ManageDocsLauncher as PoManageDocsLauncher } from '@generated/purchase-order/custom/PurchaseOrderActions';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';
import { useMenuLabel } from '@/i18n';
import { useOrderWindow } from '../shared/useOrderWindow.jsx';
import { usePurchaseOrderPdf } from '../shared/usePurchaseOrderPdf.js';
import { useTaxSifLineRowActions } from '../shared/useTaxSifLineRowActions.jsx';

// Mirrors artifacts/purchase-order/decisions.json → window.lineTaxSifTrigger (ETP-4888
// point 5 follow-up round). See sales-order/index.jsx's identical constant for the full
// rationale — GeneratedApp/HeaderPage both spread props straight through to DetailView,
// so lineCellBadges reaches the line grid unchanged. Keep in sync with decisions.json.
const LINE_TAX_SIF_TRIGGER_ENABLED = true;

const LIST_COLUMNS = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date', dot: false, required: true },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', required: true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount', required: true },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent', label: 'Invoice Status' },
  { key: 'deliveryStatusPurchase', column: 'DeliveryStatusPurchase', type: 'percent', label: 'Reception Status' },
];

const draftModeWithModal = {
  enabled: true,
  processField: 'documentAction',
  processValue: 'CO',
  label: 'poConfirmBtn',
  disableWhenEmpty: true,
  onConfirm: () => window.dispatchEvent(new CustomEvent('purchase-order:open-confirm-modal')),
};

// Mirrors artifacts/purchase-order/decisions.json → window.labelOverrides.
// The list view here bypasses the generated HeaderPage and renders ListView
// directly, so the generator-emitted labelOverrides do not reach it. Mirror
// here until the wrapper consumes the spec's labelOverrides at runtime.
const LABEL_OVERRIDES = {
  es_ES: {
    C_BPartner_ID: 'Contacto',
    DatePromised: 'Fecha de entrega esperada',
    DeliveryStatusPurchase: 'Estado de recepción',
    InvoiceStatus: 'Estado de facturación',
  },
  en_US: {
    C_BPartner_ID: 'Contact',
    DatePromised: 'Expected Delivery Date',
    DeliveryStatusPurchase: 'Reception Status',
    InvoiceStatus: 'Invoicing Status',
  },
};

const PO_MANAGE_LABELS = {
  both: 'poManageReceiptAndInvoice',
  primary: 'poManageReceipt',
  invoice: 'poManageInvoice',
};

function PurchaseOrderBulkActions(props) {
  return (
    <>
      <BulkPurchaseOrderMoreMenu {...props} data-testid="BulkPurchaseOrderMoreMenu__b7ace5" />
      <BulkDocumentAction
        {...props}
        buildActions={buildInOutActions}
        labelKey="confirmBulk"
        data-testid="BulkDocumentAction__b7ace5" />
      <CopyLinkButton
        selectedRows={props.selectedRows}
        windowName={props.windowName}
        data-testid="CopyLinkButton__b7ace5" />
    </>
  );
}

function CustomHeaderTable(props) {
  return <HeaderTable columns={LIST_COLUMNS} {...props} data-testid="HeaderTable__b7ace5" />;
}

export default function PurchaseOrderWindow(props) {
  const { recordId, windowName, token, apiBaseUrl } = props;
  const [cloneTargets, setCloneTargets] = useState(null);
  const tMenu = useMenuLabel();

  const { headers, createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'purchase' });

  const {
    refreshKey, setRefreshKey,
    renderPreview, rowQuickActions,
    effectiveRecord, clearSavedRecord,
    deleteDialog, confirmPortal, confirmResultPortal, manageLauncher,
    emailModalPortal,
  } = useOrderWindow({
    windowName, token, apiBaseUrl,
    specName: 'purchase-order',
    deliveryKey: 'deliveryStatusPurchase',
    manageLabelKeys: PO_MANAGE_LABELS,
    confirmLabelKey: 'poConfirmBtn',
    headers,
    ConfirmModal: PoConfirmModal,
    ConfirmResultModal: PoConfirmResultModal,
    ManageDocsLauncher: PoManageDocsLauncher,
    setCloneTargets,
    usePdf: usePurchaseOrderPdf,
    documentType: tMenu('Purchase Order'),
  });

  // ETP-4888 point 5 follow-up — see LINE_TAX_SIF_TRIGGER_ENABLED above for the
  // decisions.json mirror note.
  const { cellBadges: taxSifCellBadges, modal: taxSifModal } = useTaxSifLineRowActions({
    apiBaseUrl, token, enabled: LINE_TAX_SIF_TRIGGER_ENABLED, recordId, windowCategory: 'purchases', specName: 'purchase-order',
  });

  // ETP-4520 — this custom window's own hand-rolled list view (below) never delegated
  // to GeneratedApp, so it never picked up the generated HeaderPage's access-tier guard.
  // Checked once here, before either branch, so both list and detail are covered.
  const windowAccessTier = useWindowAccess('181');
  // ETP-4520 — mirrors buildWindowAccessWiring's effectiveWindow: the hand-rolled
  // ListView below never picked up the read-only tier either, unlike GeneratedApp
  // (which already forces window.readOnly internally for the detail branch).
  // Computed unconditionally, before the early return below, so hook order stays
  // stable across renders regardless of windowAccessTier.
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="181" data-testid="WindowAccessGuard__b7ace5" />;
  }

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <GeneratedApp
          {...props}
          draftMode={draftModeWithModal}
          linesEmptyState={LinesEmptyState}
          lineCellBadges={taxSifCellBadges}
          data-testid="GeneratedApp__b7ace5" />
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
        entityLabel="Purchase Order"
        windowName={windowName}
        breadcrumb="Purchases / Purchase Order"
        labelOverrides={LABEL_OVERRIDES}
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        rowQuickActions={rowQuickActions}
        hideLink
        bulkActions={PurchaseOrderBulkActions}
        dateFilterKey="orderDate"
        refreshTrigger={refreshKey}
        renderPreview={renderPreview}
        externalPreviewRow={effectiveRecord}
        onExternalPreviewClose={clearSavedRecord}
        {...props}
        window={effectiveWindow}
        data-testid="ListView__b7ace5" />
      {deleteDialog}
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          routePrefix="/purchase-order/"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
          data-testid="CloneOrderModal__b7ace5" />,
        document.body,
      )}
      {confirmPortal}
      {manageLauncher}
      {confirmResultPortal}
      {emailModalPortal}
    </>
  );
}
