import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ListView } from '@/components/contract-ui';
import { useUI, useMenuLabel } from '@/i18n';
import { useAuth, useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { useRowDelete } from '@/hooks/useRowDelete';
import HeaderPage from '@generated/sales-invoice/generated/web/sales-invoice/HeaderPage';
import InvoiceHeaderTable from '@generated/sales-invoice/custom/InvoiceHeaderTable.jsx';
import InvoicePreview from '../shared/InvoicePreview.jsx';
import SalesInvoiceTopbar from './SalesInvoiceTopbar.jsx';
import InvoiceBottomPanel from '@generated/sales-invoice/custom/InvoiceBottomPanel.jsx';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';
import { useInvoicePdf } from '../shared/useInvoicePdf.js';
import { getInvoiceDraftMode, buildInvoiceRowQuickActions, useClearSavedRecord } from '../shared/useInvoiceWindow.js';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';

/* eslint-disable react/prop-types */

const LIST_COLUMNS = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', required: true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount', required: true },
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
// ETP-4737: kept in sync by hand with artifacts/sales-invoice/decisions.json's
// window.subsetFilters (rectificativeInvoicesTab block) — this hand-rolled
// SalesInvoiceWindow component bypasses the generated HeaderPage.jsx, so the
// generator's decisions.json → contract.json → HeaderPage.jsx flow does not
// reach this array. Any future change to the subsetFilters discriminator in
// decisions.json MUST be mirrored here too.
const SUBSET_FILTERS = [
  { label: 'allTab' },
  {
    label: 'invoicesTab',
    filter: 'criteria=%5B%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22ARI%22%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24etsgIsRectificative%22%2C%22operator%22%3A%22notEqual%22%2C%22value%22%3Atrue%7D%5D',
  },
  {
    label: 'rectificativeInvoicesTab',
    filter: 'criteria=%5B%7B%22_constructor%22%3A%22AdvancedCriteria%22%2C%22operator%22%3A%22or%22%2C%22criteria%22%3A%5B%7B%22fieldName%22%3A%22transactionDocument%24etsgIsRectificative%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22ARC%22%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22ARI_RM%22%7D%5D%7D%5D',
  },
];

const OVERDUE_INITIAL_COLUMNS = [
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', required: true },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', required: true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', required: true },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount', required: true },
  { key: 'eTGODueDate', column: 'em_etgo_due_date', type: 'date' },
];

function SalesInvoiceBulkAction(props) {
  return (
    <BulkDocumentAction
      {...props}
      labelKey="confirmBulk"
      data-testid="BulkDocumentAction__c01c21" />
  );
}

function SalesInvoiceTable(props) {
  return <InvoiceHeaderTable {...props} data-testid="InvoiceHeaderTable__c01c21" />;
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
  const tMenu = useMenuLabel();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile } = useFiscalConfig(orgId, apiBaseUrl);
  const { showVerifactu } = getInvoiceFiscalTargets('sales-invoice', profile);
  const [savedRecord, setSavedRecord] = useState(null);
  const [cloneTargets, setCloneTargets] = useState(null);
  const [emailRow, setEmailRow] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { headers, createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'sale' });
  const { pdfUrl: emailPdfUrl, loading: emailPdfLoading } = useInvoicePdf(emailRow?.id ?? null, apiBaseUrl, token);
  const breadcrumb = 'Sales / Sales Invoice';

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'header',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const rowQuickActions = useMemo(
    () => buildInvoiceRowQuickActions(navigate, windowName, setCloneTargets, setEmailRow, requestDelete),
    [navigate, windowName, requestDelete],
  );

  // Pick up the saved record from navigation state when arriving at the list view
  const effectiveRecord = savedRecord ?? location.state?.savedRecord ?? null;

  const clearSavedRecord = useClearSavedRecord(setSavedRecord, location, navigate);
  const draftModeOverride = getInvoiceDraftMode(ui, { showVerifactuProcessingModal: showVerifactu });

  // ETP-4520 — this custom window's own hand-rolled list view (below) never delegated
  // to GeneratedApp, so it never picked up the generated HeaderPage's access-tier guard.
  // Checked once here, before either branch, so both list and detail are covered.
  const windowAccessTier = useWindowAccess('167');
  // ETP-4520 — mirrors buildWindowAccessWiring's effectiveWindow: the hand-rolled
  // ListView below never picked up the read-only tier either, unlike GeneratedApp
  // (which already forces window.readOnly internally for the detail branch).
  // Computed unconditionally, before the early return below, so hook order stays
  // stable across renders regardless of windowAccessTier.
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="167" data-testid="WindowAccessGuard__c01c21" />;
  }

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <HeaderPage
          {...props}
          draftMode={draftModeOverride}
          bottomSection={InvoiceBottomPanel}
          topbarRight={SalesInvoiceTopbar}
          notesField="description"
          onAfterSave={true}
          refetchAfterSave={true}
          breadcrumb={breadcrumb}
          data-testid="HeaderPage__c01c21" />
        {contactPortal}
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
        subsetFilters={SUBSET_FILTERS}
        initialColumnFilters={initialColumnFilters}
        initialAdvancedFilter={initialAdvancedFilter}
        initialColumns={isInvoiceFilter ? OVERDUE_INITIAL_COLUMNS : null}
        dateFilterKey="invoiceDate"
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        rowQuickActions={rowQuickActions}
        bulkActions={SalesInvoiceBulkAction}
        refreshTrigger={refreshKey}
        renderPreview={({ row, onClose, onEdit }) => (
          <InvoicePreview
            invoice={row}
            specName="sales-invoice"
            token={token}
            apiBaseUrl={apiBaseUrl}
            windowName={windowName}
            onClose={onClose}
            onEdit={onEdit}
            onInvoiceUpdated={() => setRefreshKey(k => k + 1)}
            data-testid="InvoicePreview__c01c21" />
        )}
        externalPreviewRow={effectiveRecord}
        onExternalPreviewClose={clearSavedRecord}
        window={effectiveWindow}
        data-testid="ListView__c01c21" />
      {deleteDialog}
      {emailRow && createPortal(
        <SendDocumentModal
          documentType={tMenu('Sales Invoice')}
          documentNo={emailRow.documentNo}
          bpName={emailRow['businessPartner$_identifier']}
          bPartnerId={emailRow.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={emailRow.id}
          windowName={windowName}
          token={token}
          pdfBlobUrl={emailPdfUrl}
          pdfBlobLoading={emailPdfLoading}
          onClose={() => setEmailRow(null)}
          data-testid="SendDocumentModal__c01c21" />,
        document.body,
      )}
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
          data-testid="CloneOrderModal__c01c21" />,
        document.body,
      )}
    </>
  );
}
