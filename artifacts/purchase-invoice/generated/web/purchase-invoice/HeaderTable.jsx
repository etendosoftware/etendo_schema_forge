import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date', required: true },
  { key: 'orderReference', column: 'POReference', type: 'string', label: 'Supplier Reference' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', enumLabels: { 'CL': 'Closed', 'CO': 'Completed', 'DR': 'Draft', 'NA': 'Not Accepted', 'WP': 'Not Paid', 'RE': 'Re-Opened', 'TEMP': 'Temporal', 'IP': 'Under Way', '??': 'Unknown', 'VO': 'Voided' }, required: true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount', required: true },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount', label: 'Total Outstanding', required: true },
  { key: 'eTGODueDate', column: 'em_etgo_due_date', type: 'date', label: 'em_etgo_due_date' },
  { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'number', label: 'em_etgo_delivery_status' },
];
// @sf-generated-end columns:header

const filters = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus', 'eTGODueDate'];

// @sf-generated-start component:HeaderTable
const HeaderTable = forwardRef(function HeaderTable(props, ref) {
  // Inline-editable layout owns rendering of the existing rows. The add-line flow keeps
  // using the proven DataTable inline-add row (callouts, focus management, defaults) —
  // when addRow.active flips on, we hand off to DataTable so the user can fill the new
  // line, then return to InlineLinesPanel once addRow.active flips off again. The ref
  // is forwarded so DetailView can imperatively flush pending edits on global save.
  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default HeaderTable;
// @sf-generated-end component:HeaderTable
