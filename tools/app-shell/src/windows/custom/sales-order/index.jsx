import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { buildPendingDeliveryFilter } from '../shared/pendingDeliveryFilter.js';
import GeneratedApp from '@generated/sales-order/generated/web/sales-order/index.jsx';
import HeaderTable from '@generated/sales-order/generated/web/sales-order/HeaderTable';
import OrderReactivateBulkAction from '@generated/sales-order/custom/OrderReactivateBulkAction';
import BulkOrderMoreMenu from '@generated/sales-order/custom/BulkOrderMoreMenu';
import { ListView } from '@/components/contract-ui';

const LIST_COLUMNS = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date', dot: false },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent', label: 'Invoice Status' },
  { key: 'deliveryStatus', column: 'DeliveryStatus', type: 'percent', label: 'Shipment Status' },
];

function CustomHeaderTable(props) {
  return <HeaderTable columns={LIST_COLUMNS} {...props} />;
}
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import CreateContactModal from '@/components/contract-ui/CreateContactModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.js';
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';

// Mirrors artifacts/sales-order/decisions.json → window.labelOverrides.
// The list view here bypasses the generated HeaderPage and renders ListView
// directly, so the generator-emitted labelOverrides do not reach it. Mirror
// here until the wrapper consumes the spec's labelOverrides at runtime.
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
  onConfirm: () => window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal')),
};

export default function SalesOrderWindow({ windowName, recordId, token, apiBaseUrl, ...rest }) {
  useBulkActionToast();
  const [searchParams] = useSearchParams();
  const [cloneTargets, setCloneTargets] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { bpApiBaseUrl, headers, createContactState, setCreateContactState, createContactCtxValue } =
    useCreateContactModal({ apiBaseUrl, token });

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
        />
        {createContactState && createPortal(
          <CreateContactModal
            bpApiBaseUrl={bpApiBaseUrl}
            headers={headers}
            initialQuery={createContactState.query}
            documentType="sale"
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
    buildPendingDeliveryFilter(searchParams, 'deliveryStatus');

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
        token={token}
        apiBaseUrl={apiBaseUrl}
        hidePrint
        bulkActions={(ctx) => (
          <>
            <BulkOrderMoreMenu {...ctx} />
            <OrderReactivateBulkAction {...ctx} />
          </>
        )}
        initialColumnFilters={initialColumnFilters}
        initialAdvancedFilter={initialAdvancedFilter}
        initialColumns={isPendingDelivery ? LIST_COLUMNS : null}
        dateFilterKey="orderDate"
        refreshTrigger={refreshKey}
        {...rest}
      />
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          routePrefix="/sales-order/"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
        />,
        document.body,
      )}
    </>
  );
}
