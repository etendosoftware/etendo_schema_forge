import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ListView } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import PurchaseInvoiceHeaderTable from './PurchaseInvoiceHeaderTable.jsx';
import HeaderPage from '@generated/purchase-invoice/generated/web/purchase-invoice/HeaderPage';
import InvoicePreviewModal from '../shared/InvoicePreviewModal.jsx';
import PurchaseInvoiceTopbar from './PurchaseInvoiceTopbar.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import CreateContactModal from '@/components/contract-ui/CreateContactModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.js';

/* eslint-disable react/prop-types */

const LIST_COLUMNS = [
  { key: 'orderReference', column: 'POReference', type: 'string', label: 'Document No.' },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
];
// Mirrors PurchaseInvoiceHeaderTable columns (key + column + type only) so that
// buildAdvancedFilterCriteria can resolve filter modes on the first render,
// before DataTable fires onColumnsReady.
const OVERDUE_INITIAL_COLUMNS = [
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date' },
  { key: 'orderReference', column: 'POReference', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount' },
  { key: 'eTGODueDate', column: 'em_etgo_due_date', type: 'date' },
];

// Mirrors artifacts/purchase-invoice/decisions.json → window.labelOverrides.
// The list view here bypasses the generated HeaderPage and renders ListView
// directly, so the generator-emitted labelOverrides do not reach it. Mirror
// here until the wrapper consumes the spec's labelOverrides at runtime.
const LABEL_OVERRIDES = {
  es_ES: {
    POReference: 'Nº documento',
    OutstandingAmt: 'Pendiente de pago',
    em_etgo_delivery_status: 'Estado de entrega',
  },
  en_US: {
    POReference: 'Document No.',
    OutstandingAmt: 'Pending Payment',
    em_etgo_delivery_status: 'Delivery Status',
  },
};

let previewRowSetterRef = null;

/**
 * PurchaseInvoiceTable — generated table wrapper that opens the preview modal.
 * Columns are driven by decisions.json via the generated HeaderTable.
 */
function PurchaseInvoiceTable(props) {
  return (
    <PurchaseInvoiceHeaderTable
      {...props}
      onNavigate={(row) => previewRowSetterRef?.(row)}
    />
  );
}

/**
 * Main entry point for the purchase-invoice custom window.
 *
 * Routing:
 *   - recordId present  → standard InvoicePage (new / edit mode)
 *   - no recordId       → custom list view with preview modal
 */
export default function PurchaseInvoiceWindow(props) {
  useBulkActionToast();
  const { recordId, token, apiBaseUrl, windowName } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const ui = useUI();
  const [savedRecord, setSavedRecord] = useState(null);
  const [previewRow, setPreviewRow] = useState(null);
  const [cloneTargets, setCloneTargets] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { bpApiBaseUrl, headers, createContactState, setCreateContactState, createContactCtxValue } =
    useCreateContactModal({ apiBaseUrl, token });
  const breadcrumb = 'Purchases / Purchase Invoice';
  previewRowSetterRef = setPreviewRow;

  const summary = [
    { key: 'summedLineAmount', column: 'TotalLines', type: 'amount', label: ui('totalNetAmount') },
    { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: ui('totalGrossAmount') },
    { key: 'totalPaid', column: 'Totalpaid', type: 'amount', label: ui('paidAmount') },
    { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount', label: ui('outstandingAmount') },
  ];

  const customTabs = [{ key: 'related', label: ui('relatedDocuments'), Component: RelatedDocuments }];

  // Pick up the saved record from navigation state when arriving at the list view
  const effectiveRecord = savedRecord ?? location.state?.savedRecord ?? null;

  const clearSavedRecord = useCallback(() => {
    setSavedRecord(null);
    // Clear navigation state so the modal doesn't reappear on browser back/forward
    if (location.state?.savedRecord) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <HeaderPage
          {...props}
          secondaryTabs={[]}
          summary={summary}
          extraBadges={[]}
          topbarRight={PurchaseInvoiceTopbar}
          notesField="description"
          customTabs={customTabs}
          breadcrumb={breadcrumb}
          onAfterSave={true}
          refetchAfterSave={true}
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

  const filterParam = searchParams.get('filter');
  const docStatus = searchParams.get('DocStatus');

  const isOverdue = filterParam === 'overdue';
  const isPaymentsDueToday = filterParam === 'paymentsDueToday';
  const isInvoiceFilter = isOverdue || isPaymentsDueToday;

  const todayISO = new Date().toISOString().slice(0, 10);

  const initialAdvancedFilter = isInvoiceFilter
    ? {
        rowOperator: 'and',
        conditions: [
          { field: 'documentStatus', operator: 'equals', value: 'CO' },
          { field: 'outstandingAmount', operator: 'greaterThan', value: 0 },
          ...(isPaymentsDueToday
            ? [{ field: 'eTGODueDate', operator: 'equals', value: todayISO }]
            : []),
        ],
      }
    : null;

  const initialColumnFilters = docStatus ? { documentStatus: docStatus } : undefined;

  return (
    <>
      <ListView
        {...props}
        entity="header"
        Table={PurchaseInvoiceTable}
        entityLabel="Purchase Invoice"
        breadcrumb={breadcrumb}
        labelOverrides={LABEL_OVERRIDES}
        initialColumnFilters={initialColumnFilters}
        initialAdvancedFilter={initialAdvancedFilter}
        initialColumns={isInvoiceFilter ? OVERDUE_INITIAL_COLUMNS : null}
        dateFilterKey="invoiceDate"
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        bulkActions={(ctx) => <BulkDocumentAction {...ctx} />}
        refreshTrigger={refreshKey}
      />
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          routePrefix="/purchase-invoice/"
          errorKey="cloneInvoiceError"
          processingKey="invoiceProcessing"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
        />,
        document.body,
      )}
      {(previewRow || effectiveRecord) && (
        <InvoicePreviewModal
          invoice={previewRow || effectiveRecord}
          token={token}
          apiBaseUrl={apiBaseUrl}
          windowName={windowName}
          specName="purchase-invoice"
          onClose={() => {
            setPreviewRow(null);
            clearSavedRecord();
          }}
          onEdit={(id) => {
            setPreviewRow(null);
            clearSavedRecord();
            navigate(`/${windowName}/${id}`);
          }}
        />
      )}
    </>
  );
}
