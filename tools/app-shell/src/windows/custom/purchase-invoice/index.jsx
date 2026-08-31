import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import { useUI, useMenuLabel } from '@/i18n';
import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
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
import { useTaxSifLineRowActions } from '../shared/useTaxSifLineRowActions.jsx';

/* eslint-disable react/prop-types */

// Mirrors artifacts/purchase-invoice/decisions.json → window.lineTaxSifTrigger (ETP-4888
// point 5, docs/decisions-reference.md). See sales-invoice/index.jsx's identical constant
// for the full rationale: DetailView's `lineCellBadges` prop has no generate-frontend.js
// wiring, so it's hand-added on the `<HeaderPage>` call like this window's other extras
// (topbarRight, sidePanel, notesField below). Keep in sync with the decisions.json flag.
const LINE_TAX_SIF_TRIGGER_ENABLED = true;

const DOC_TYPE_LABELS = {
  'AP Invoice': 'Factura',
  'AP CreditMemo': 'Nota de Crédito',
  'Return Material Purchase Invoice': 'Factura de Devolución',
  'Reversed Purchase Invoice': 'Factura de Devolución',
};

// i18n-allowlist: ["allTab", "invoicesTab", "rectificativeInvoicesTab"]
// ETP-4737: server-side criteria, mirrored 1:1 from
// artifacts/purchase-invoice/decisions.json → window.subsetFilters. Discriminates
// on etsgIsRectificative / documentCategory (the same fields the AD data uses),
// NOT on the raw doc-type identifier string — a name match silently misses any
// new document type sharing the same category (this is exactly how "Factura
// Rectificativa (compras)" fell through to "Todos" until this fix, since it was
// never rendered by the generated HeaderPage this window bypasses). Keep this
// array's filter criteria in sync with decisions.json whenever that
// discriminator changes.
const INVOICE_SUBSET_FILTERS = [
  { label: 'allTab' },
  { label: 'invoicesTab', filter: 'criteria=%5B%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22API%22%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24etsgIsRectificative%22%2C%22operator%22%3A%22notEqual%22%2C%22value%22%3Atrue%7D%5D' },
  { label: 'rectificativeInvoicesTab', filter: 'criteria=%5B%7B%22_constructor%22%3A%22AdvancedCriteria%22%2C%22operator%22%3A%22or%22%2C%22criteria%22%3A%5B%7B%22fieldName%22%3A%22transactionDocument%24etsgIsRectificative%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22APC%22%7D%5D%7D%5D' },
];

function applyDocTypeLabels(record) {
  const id = record['transactionDocument$_identifier'];
  if (!id || !DOC_TYPE_LABELS[id]) return record;
  return { ...record, 'transactionDocument$_identifier': DOC_TYPE_LABELS[id] };
}

const LIST_COLUMNS = [
  { key: 'orderReference', column: 'POReference', type: 'string', label: 'Document No.' },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', required: true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount', required: true },
];
// Mirrors PurchaseInvoiceHeaderTable columns (key + column + type only) so that
// buildAdvancedFilterCriteria can resolve filter modes on the first render,
// before DataTable fires onColumnsReady.
const OVERDUE_INITIAL_COLUMNS = [
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', required: true },
  { key: 'orderReference', column: 'POReference', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', required: true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', required: true },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount', required: true },
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
    <>
      <BulkDocumentAction
        {...props}
        labelKey="confirmBulk"
        data-testid="BulkDocumentAction__c20e53" />
      <CopyLinkButton
        selectedRows={props.selectedRows}
        windowName={props.windowName}
        data-testid="CopyLinkButton__c20e53" />
    </>
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
  // ETP-4888 point 5 — see LINE_TAX_SIF_TRIGGER_ENABLED above for the decisions.json mirror note.
  const { cellBadges: taxSifCellBadges, modal: taxSifModal } = useTaxSifLineRowActions({
    apiBaseUrl, token, enabled: LINE_TAX_SIF_TRIGGER_ENABLED, recordId, windowCategory: 'purchases', specName: 'purchase-invoice',
  });

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
    { key: 'summedLineAmount', column: 'TotalLines', type: 'amount', label: ui('totalNetAmount'), required: true },
    { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: ui('totalGrossAmount'), required: true },
    { key: 'totalPaid', column: 'Totalpaid', type: 'amount', label: ui('paidAmount'), required: true },
    { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount', label: ui('outstandingAmount'), required: true },
  ];

  // Pick up the saved record from navigation state when arriving at the list view
  const effectiveRecord = savedRecord ?? location.state?.savedRecord ?? null;

  const clearSavedRecord = useClearSavedRecord(setSavedRecord, location, navigate);
  const draftModeOverride = getInvoiceDraftMode(ui);

  // ETP-4520 — this custom window's own hand-rolled list view (below) never delegated
  // to GeneratedApp, so it never picked up the generated HeaderPage's access-tier guard.
  // Checked once here, before either branch, so both list and detail are covered.
  const windowAccessTier = useWindowAccess('183');
  // ETP-4520 — mirrors buildWindowAccessWiring's effectiveWindow: the hand-rolled
  // ListView below never picked up the read-only tier either, unlike GeneratedApp
  // (which already forces window.readOnly internally for the detail branch).
  // Computed unconditionally, before the early return below, so hook order stays
  // stable across renders regardless of windowAccessTier.
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="183" data-testid="WindowAccessGuard__c20e53" />;
  }

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
          lineCellBadges={taxSifCellBadges}
          data-testid="HeaderPage__c20e53" />
        {contactPortal}
        {taxSifModal}
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
        hideLink
        bulkActions={PurchaseInvoiceBulkAction}
        hidePrint
        hideEyeCount
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
            onInvoiceUpdated={() => setRefreshKey(k => k + 1)}
            data-testid="InvoicePreview__c20e53" />
        )}
        externalPreviewRow={effectiveRecord}
        onExternalPreviewClose={clearSavedRecord}
        window={effectiveWindow}
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
