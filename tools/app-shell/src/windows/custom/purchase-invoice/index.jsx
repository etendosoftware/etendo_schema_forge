import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ListView } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import HeaderTable from '@generated/purchase-invoice/generated/web/purchase-invoice/HeaderTable';
import HeaderPage from '@generated/purchase-invoice/generated/web/purchase-invoice/HeaderPage';
import TaxTable from '@generated/purchase-invoice/generated/web/purchase-invoice/TaxTable';
import InvoiceLineTableCustom from './InvoiceLineTableCustom.jsx';
import PaymentDetailsPanelCustom from './PaymentDetailsPanelCustom.jsx';
import InvoicePreviewModal from './InvoicePreviewModal.jsx';
import PurchaseInvoiceTopbar from './PurchaseInvoiceTopbar.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';

/* eslint-disable react/prop-types */

const LIST_COLUMNS = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
];

let previewRowSetterRef = null;

/**
 * PurchaseInvoiceTable — generated table wrapper that opens the preview modal.
 */
function PurchaseInvoiceTable(props) {
  return (
    <HeaderTable
      columns={LIST_COLUMNS}
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
  const { recordId, token, apiBaseUrl, windowName } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const ui = useUI();
  const [savedRecord, setSavedRecord] = useState(null);
  const [previewRow, setPreviewRow] = useState(null);
  const breadcrumb = 'Purchases / Purchase Invoice';
  previewRowSetterRef = setPreviewRow;

  const secondaryTabs = [
    { key: 'tax', label: ui('tax'), Table: TaxTable },
    { key: 'paymentDetails', label: ui('paymentDetails'), Panel: PaymentDetailsPanelCustom },
  ];

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
      <HeaderPage
        {...props}
        DetailTable={InvoiceLineTableCustom}
        secondaryTabs={secondaryTabs}
        summary={summary}
        extraBadges={[]}
        topbarRight={PurchaseInvoiceTopbar}
        notesField="description"
        customTabs={customTabs}
        onAfterSave={true}
        breadcrumb={breadcrumb}
      />
    );
  }

  return (
    <>
      <ListView
        {...props}
        entity="header"
        Table={PurchaseInvoiceTable}
        entityLabel="Purchase Invoice"
        breadcrumb={breadcrumb}
      />
      {(previewRow || effectiveRecord) && (
        <InvoicePreviewModal
          invoice={previewRow || effectiveRecord}
          token={token}
          apiBaseUrl={apiBaseUrl}
          windowName={windowName}
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
