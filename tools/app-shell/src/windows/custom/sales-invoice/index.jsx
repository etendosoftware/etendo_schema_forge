import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ListView } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import HeaderPage from '@generated/sales-invoice/generated/web/sales-invoice/HeaderPage';
import InvoiceHeaderTable from '@generated/sales-invoice/custom/InvoiceHeaderTable.jsx';
import InvoicePreviewModal from '../shared/InvoicePreviewModal.jsx';
import SalesInvoiceTopbar from './SalesInvoiceTopbar.jsx';
import SalesInvoiceLinesTable from './SalesInvoiceLinesTable.jsx';
import InvoiceBottomPanel from '@generated/sales-invoice/custom/InvoiceBottomPanel.jsx';
import RelatedDocuments from '@generated/sales-invoice/custom/RelatedDocuments.jsx';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import CreateContactModal from '@/components/contract-ui/CreateContactModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.js';

/* eslint-disable react/prop-types */

const LIST_COLUMNS = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
];
// Mirrors artifacts/sales-invoice/decisions.json → window.labelOverrides.
// The list view here bypasses the generated HeaderPage and renders ListView
// directly, so the generator-emitted labelOverrides do not reach it. Mirror
// here until the wrapper consumes the spec's labelOverrides at runtime.
const LABEL_OVERRIDES = {
  es_ES: {
    OutstandingAmt: 'Pendiente de pago',
    em_etgo_delivery_status: 'Estado de entrega',
  },
  en_US: {
    OutstandingAmt: 'Pending Payment',
    em_etgo_delivery_status: 'Delivery Status',
  },
};

// Mirrors InvoiceHeaderTable columns (key + column + type only) so that
// buildAdvancedFilterCriteria can resolve filter modes on the first render,
// before DataTable fires onColumnsReady.
const OVERDUE_INITIAL_COLUMNS = [
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date' },
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount' },
  { key: 'eTGODueDate', column: 'em_etgo_due_date', type: 'date' },
];

let previewRowSetterRef = null;

/**
 * SalesInvoiceTable — uses InvoiceHeaderTable (with type tabs + payment filter)
 * and hooks in the preview modal via onNavigate.
 * Columns and order are driven by InvoiceHeaderTable.jsx.
 */
function SalesInvoiceTable(props) {
  return (
    <InvoiceHeaderTable
      {...props}
      onNavigate={(row) => previewRowSetterRef?.(row)}
    />
  );
}

/**
 * Main entry point for the sales-invoice custom window.
 *
 * Routing:
 *   - recordId present  → standard HeaderPage (new / edit mode)
 *   - no recordId       → ListView with lateral preview modal
 *
 * To add grid clone (single + multirecord), see sales-order/index.jsx as reference:
 *   1. import CloneOrderModal from '@/components/contract-ui/CloneOrderModal'
 *   2. add useState(null) for cloneTargets
 *   3. pass onCloneRow to ListView
 *   4. render CloneOrderModal portal with cloneActionName="cloneRecord" and invoice i18n keys
 */
export default function SalesInvoiceWindow(props) {
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
  const breadcrumb = 'Sales / Sales Invoice';
  previewRowSetterRef = setPreviewRow;

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
          DetailTable={SalesInvoiceLinesTable}
          bottomSection={InvoiceBottomPanel}
          topbarRight={SalesInvoiceTopbar}
          notesField="description"
          customTabs={[{ key: 'related', label: ui('relatedDocuments'), Component: RelatedDocuments }]}
          onAfterSave={true}
          refetchAfterSave={true}
          addLineGuard={(d) => !!d?.businessPartner}
          breadcrumb={breadcrumb}
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

  const filterParam = searchParams.get('filter');
  const docStatus = searchParams.get('DocStatus');

  const isOverdue = filterParam === 'overdue';
  const isCollectionsDueToday = filterParam === 'collectionsDueToday';
  const isInvoiceFilter = isOverdue || isCollectionsDueToday;

  const todayISO = new Date().toISOString().slice(0, 10);

  const initialAdvancedFilter = isInvoiceFilter
    ? {
        rowOperator: 'and',
        conditions: [
          { field: 'documentStatus', operator: 'equals', value: 'CO' },
          { field: 'outstandingAmount', operator: 'greaterThan', value: 0 },
          ...(isCollectionsDueToday
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
        Table={SalesInvoiceTable}
        entityLabel="Sales Invoice"
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
          routePrefix="/sales-invoice/"
          errorKey="cloneInvoiceError"
          processingKey="invoiceProcessing"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
        />,
        document.body,
      )}
      {(previewRow || effectiveRecord) && (
        <InvoicePreviewModal
          specName="sales-invoice"
          invoice={previewRow || effectiveRecord}
          token={token}
          apiBaseUrl={apiBaseUrl}
          windowName={windowName}
          onInvoiceUpdated={(updatedInvoice) => {
            setPreviewRow((current) => (current ? updatedInvoice : current));
            setSavedRecord((current) => (current ? updatedInvoice : current));
            setRefreshKey(k => k + 1);
          }}
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
