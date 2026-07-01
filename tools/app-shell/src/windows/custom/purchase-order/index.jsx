import { useState } from 'react';
import { createPortal } from 'react-dom';
import GeneratedApp from '@generated/purchase-order/generated/web/purchase-order/index.jsx';
import HeaderTable from '@generated/purchase-order/generated/web/purchase-order/HeaderTable';
import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';
import BulkPurchaseOrderMoreMenu from '@generated/purchase-order/custom/BulkPurchaseOrderMoreMenu';
import { ConfirmModal as PoConfirmModal, PoConfirmResultModal, ManageDocsLauncher as PoManageDocsLauncher } from '@generated/purchase-order/custom/PurchaseOrderActions';
import { ListView } from '@/components/contract-ui';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';
import { useOrderWindow } from '../shared/useOrderWindow.jsx';

const LIST_COLUMNS = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date', dot: false },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
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
    </>
  );
}

function CustomHeaderTable(props) {
  return <HeaderTable columns={LIST_COLUMNS} {...props} data-testid="HeaderTable__b7ace5" />;
}

export default function PurchaseOrderWindow(props) {
  const { recordId, windowName, token, apiBaseUrl } = props;
  const [cloneTargets, setCloneTargets] = useState(null);

  const { headers, createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'purchase' });

  const {
    refreshKey, setRefreshKey,
    renderPreview, rowQuickActions,
    effectiveRecord, clearSavedRecord,
    deleteDialog, confirmPortal, confirmResultPortal, manageLauncher,
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
  });

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <GeneratedApp
          {...props}
          draftMode={draftModeWithModal}
          linesEmptyState={LinesEmptyState}
          data-testid="GeneratedApp__b7ace5" />
        {contactPortal}
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
        bulkActions={PurchaseOrderBulkActions}
        dateFilterKey="orderDate"
        refreshTrigger={refreshKey}
        renderPreview={renderPreview}
        externalPreviewRow={effectiveRecord}
        onExternalPreviewClose={clearSavedRecord}
        {...props}
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
    </>
  );
}
