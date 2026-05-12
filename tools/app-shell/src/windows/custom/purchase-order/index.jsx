import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { buildPendingDeliveryFilter } from '../shared/pendingDeliveryFilter.js';
import { ListView } from '@/components/contract-ui';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import CreateContactModal from '@/components/contract-ui/CreateContactModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.js';
import HeaderTable from '@generated/purchase-order/generated/web/purchase-order/HeaderTable';
import GeneratedApp from '@generated/purchase-order/generated/web/purchase-order/index.jsx';
import PurchaseOrderReactivateBulkAction from '@generated/purchase-order/custom/PurchaseOrderReactivateBulkAction';
import BulkPurchaseOrderMoreMenu from '@generated/purchase-order/custom/BulkPurchaseOrderMoreMenu';
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';

// Simplified list columns aligned with Sales Order visual style
const LIST_COLUMNS = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date', dot: false },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent', label: 'Invoice Status' },
  { key: 'deliveryStatusPurchase', column: 'DeliveryStatusPurchase', type: 'percent', label: 'Delivery Status' },
];
const draftModeWithModal = {
  enabled: true,
  processField: 'documentAction',
  processValue: 'CO',
  label: 'poConfirmBtn',
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
    DeliveryStatusPurchase: 'Estado de entrega',
    InvoiceStatus: 'Estado de facturación',
  },
  en_US: {
    C_BPartner_ID: 'Contact',
    DatePromised: 'Expected Delivery Date',
    DeliveryStatusPurchase: 'Delivery Status',
    InvoiceStatus: 'Invoicing Status',
  },
};

function CustomHeaderTable(props) {
  return <HeaderTable columns={LIST_COLUMNS} {...props} />;
}

export default function PurchaseOrderWindow(props) {
  useBulkActionToast();
  const { recordId, windowName, token, apiBaseUrl } = props;
  const [searchParams] = useSearchParams();
  const [cloneTargets, setCloneTargets] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { bpApiBaseUrl, headers, createContactState, setCreateContactState, createContactCtxValue } =
    useCreateContactModal({ apiBaseUrl, token });

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <GeneratedApp
          {...props}
          draftMode={draftModeWithModal}
          linesEmptyState={LinesEmptyState}
        />
        {createContactState && createPortal(
          <CreateContactModal
            bpApiBaseUrl={bpApiBaseUrl}
            headers={headers}
            initialQuery={createContactState.query}
            documentType="purchase"
            onClose={() => setCreateContactState(null)}
            onCreated={(newBP) => {
              createContactState.onSelect({ id: newBP.id, name: newBP.name });
              setCreateContactState(null);
            }}
          />,
          document.body,
        )}
      </CreateContactContext.Provider>
    );
  }

  const { initialColumnFilters, isPendingDelivery, initialAdvancedFilter } =
    buildPendingDeliveryFilter(searchParams, 'deliveryStatusPurchase');

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
        bulkActions={(ctx) => (
          <>
            <BulkPurchaseOrderMoreMenu {...ctx} />
            <PurchaseOrderReactivateBulkAction {...ctx} />
          </>
        )}
        initialColumnFilters={initialColumnFilters}
        initialAdvancedFilter={initialAdvancedFilter}
        initialColumns={isPendingDelivery ? LIST_COLUMNS : null}
        dateFilterKey="orderDate"
        refreshTrigger={refreshKey}
        {...props}
      />
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          routePrefix="/purchase-order/"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
        />,
        document.body,
      )}
    </>
  );
}
