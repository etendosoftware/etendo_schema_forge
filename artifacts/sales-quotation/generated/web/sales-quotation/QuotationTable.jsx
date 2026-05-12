import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:quotation
const columns = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Quotation Date', required: true },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', enumLabels: { 'AE': 'Automatic Evaluation', 'CO': 'Booked', 'CL': 'Closed', 'ETGO_CI': 'Closed - Invoice Created', 'CA': 'Closed - Order Created', 'CJ': 'Closed - Rejected', 'DR': 'Draft', 'ME': 'Manual Evaluation', 'NA': 'Not Accepted', 'NC': 'Not Confirmed', 'WP': 'Not Paid', 'RE': 'Re-Opened', 'TMP': 'Temporal', 'UE': 'Under Evaluation', 'IP': 'Under Way', '??': 'Unknown', 'VO': 'Voided' }, required: true },
  { key: 'validUntil', column: 'validuntil', type: 'date', label: 'Valid Until' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount', required: true },
];
// @sf-generated-end columns:quotation

const filters = ['documentNo', 'orderDate', 'businessPartner', 'validUntil', 'documentStatus'];

// @sf-generated-start component:QuotationTable
const QuotationTable = forwardRef(function QuotationTable(props, ref) {
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

export default QuotationTable;
// @sf-generated-end component:QuotationTable
