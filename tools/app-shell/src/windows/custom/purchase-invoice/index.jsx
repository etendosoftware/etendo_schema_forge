import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ListView } from '@/components/contract-ui';
import { useUI, useMenuLabel } from '@/i18n';
import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { useRowDelete } from '@/hooks/useRowDelete';
import PurchaseInvoiceHeaderTable from './PurchaseInvoiceHeaderTable.jsx';
import HeaderPage from '@generated/purchase-invoice/generated/web/purchase-invoice/HeaderPage';
import InvoicePreview from '../shared/InvoicePreview.jsx';
import PurchaseInvoiceTopbar from './PurchaseInvoiceTopbar.jsx';
import OcrSidePanel from '../shared/OcrSidePanel.jsx';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';
import { getInvoiceDraftMode, buildInvoiceRowQuickActions, useClearSavedRecord } from '../shared/useInvoiceWindow.js';

/* eslint-disable react/prop-types */

const DOC_TYPE_LABELS = {
  'AP Invoice': 'Factura',
  'AP CreditMemo': 'Nota de Crédito',
  'Return Material Purchase Invoice': 'Factura de Devolución',
  'Reversed Purchase Invoice': 'Factura de Devolución',
};

// i18n-allowlist: ["all", "invoicesTab", "creditNotesTab"]
const INVOICE_SUBSET_FILTERS = [
  { label: 'all' },
  { label: 'invoicesTab',    rowFilter: (r) => r['transactionDocument$_identifier'] === 'AP Invoice' },
  { label: 'creditNotesTab', rowFilter: (r) => r['transactionDocument$_identifier'] === 'AP CreditMemo' },
];

function applyDocTypeLabels(record) {
  const id = record['transactionDocument$_identifier'];
  if (!id || !DOC_TYPE_LABELS[id]) return record;
  return { ...record, 'transactionDocument$_identifier': DOC_TYPE_LABELS[id] };
}

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
    em_etgo_delivery_status: 'Estado de recepción',
  },
  en_US: {
    POReference: 'Document No.',
    OutstandingAmt: 'Pending Payment',
    em_etgo_delivery_status: 'Reception Status',
  },
};

function PurchaseInvoiceBulkAction(props) {
  return (
    <BulkDocumentAction
      {...props}
      labelKey="confirmBulk"
      data-testid="BulkDocumentAction__c20e53" />
  );
}

function PurchaseInvoiceTable(props) {
  return <PurchaseInvoiceHeaderTable {...props} data-testid="PurchaseInvoiceHeaderTable__c20e53" />;
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
  const tMenu = useMenuLabel();
  const [savedRecord, setSavedRecord] = useState(null);
  const [cloneTargets, setCloneTargets] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { headers, createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'purchase' });
  const breadcrumb = 'Purchases / Purchase Invoice';

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'header',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const rowQuickActions = useMemo(
    () => buildInvoiceRowQuickActions(navigate, windowName, setCloneTargets, null, requestDelete, { showEmail: false }),
    [navigate, windowName, requestDelete],
  );

  const summary = [
    { key: 'summedLineAmount', column: 'TotalLines', type: 'amount', label: ui('totalNetAmount') },
    { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: ui('totalGrossAmount') },
    { key: 'totalPaid', column: 'Totalpaid', type: 'amount', label: ui('paidAmount') },
    { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount', label: ui('outstandingAmount') },
  ];

  // Pick up the saved record from navigation state when arriving at the list view
  const effectiveRecord = savedRecord ?? location.state?.savedRecord ?? null;

  const clearSavedRecord = useClearSavedRecord(setSavedRecord, location, navigate);
  const draftModeOverride = getInvoiceDraftMode(ui);

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <HeaderPage
          {...props}
          draftMode={draftModeOverride}
          summary={summary}
          extraBadges={[]}
          topbarRight={PurchaseInvoiceTopbar}
          sidePanel={OcrSidePanel}
          sidePanelStyle={{ width: 360 }}
          notesField="description"
          breadcrumb={breadcrumb}
          onAfterSave={true}
          refetchAfterSave={true}
          transformRecord={applyDocTypeLabels}
          data-testid="HeaderPage__c20e53" />
        {contactPortal}
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
        subsetFilters={INVOICE_SUBSET_FILTERS}
        initialColumnFilters={initialColumnFilters}
        initialAdvancedFilter={initialAdvancedFilter}
        initialColumns={isInvoiceFilter ? OVERDUE_INITIAL_COLUMNS : null}
        dateFilterKey="invoiceDate"
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        rowQuickActions={rowQuickActions}
        sendDocument={{ enabled: false, allowEmail: false }}
        bulkActions={PurchaseInvoiceBulkAction}
        refreshTrigger={refreshKey}
        renderPreview={({ row, onClose, onEdit }) => (
          <InvoicePreview
            invoice={row}
            token={token}
            apiBaseUrl={apiBaseUrl}
            windowName={windowName}
            specName="purchase-invoice"
            onClose={onClose}
            onEdit={onEdit}
            data-testid="InvoicePreview__c20e53" />
        )}
        externalPreviewRow={effectiveRecord}
        onExternalPreviewClose={clearSavedRecord}
        data-testid="ListView__c20e53" />
      {deleteDialog}
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
          data-testid="CloneOrderModal__c20e53" />,
        document.body,
      )}
    </>
  );
}
