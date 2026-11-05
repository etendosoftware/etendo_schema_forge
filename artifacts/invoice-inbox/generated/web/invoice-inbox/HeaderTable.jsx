import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'fileName', column: 'File_Name', type: 'string', label: 'File Name', required: true, maxLength: 255 },
  { key: 'source', column: 'Source', type: 'enum', label: 'Source', enumLabels: { 'UPLOAD': 'sourceUpload', 'EMAIL': 'sourceEmail' }, required: true },
  { key: 'creationDate', column: 'Created', type: 'string', label: 'Created', required: true, maxLength: 19 },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'extractedName', column: 'Extracted_Name', type: 'string', label: 'Extracted Name', maxLength: 255 },
  { key: 'extractedTaxID', column: 'Extracted_TaxID', type: 'string', label: 'Extracted Tax ID', maxLength: 30 },
  { key: 'orderReference', column: 'POReference', type: 'string', label: 'Order Reference', maxLength: 20 },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Grand Total Amount' },
  { key: 'status', column: 'Status', type: 'status', label: 'Status', enumLabels: { 'PROCESSING': 'statusProcessing', 'PENDING_REVIEW': 'statusPendingReview', 'ERROR': 'statusError', 'READY': 'statusReady', 'CONFIRMED': 'statusConfirmed', 'DISCARDED': 'statusDiscarded' }, required: true },
  { key: 'errorCode', column: 'Error_Code', type: 'enum', label: 'Error Code', enumLabels: { 'UNREADABLE': 'errorCodeUnreadable', 'SERVICE_FAILURE': 'errorCodeServiceFailure', 'FOREIGN_RECEIVER': 'errorCodeForeignReceiver', 'MISSING_FIELDS': 'errorCodeMissingFields', 'REFERENCE_TOO_LONG': 'errorCodeReferenceTooLong', 'CONFIRM_FAILED': 'errorCodeConfirmFailed' } },
  { key: 'duplicateOfInvoice', column: 'Duplicate_Invoice_ID', type: 'selector', label: 'Duplicate Of Invoice' },
];
// @sf-generated-end columns:header

const filters = [];

// @sf-generated-start component:HeaderTable
const HeaderTable = forwardRef(function HeaderTable(props, ref) {
  // Inline-editable layout always uses InlineLinesPanel for existing rows so column
  // widths (flex layout) never shift when the add-row form opens. When addRow is
  // active we render a header-hidden, data-hidden DataTable below for just the
  // add-row form — it owns callouts, selectors, validation and the imperative flush
  // ref. The ref is forwarded to InlineLinesPanel so DetailView can flush pending
  // inline edits on global save.
  if (props.linesLayout === 'inlineEditable') {
    if (props.addRow?.active) {
      return (
        <>
          <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
          <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
        </>
      );
    }
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default HeaderTable;
// @sf-generated-end component:HeaderTable
