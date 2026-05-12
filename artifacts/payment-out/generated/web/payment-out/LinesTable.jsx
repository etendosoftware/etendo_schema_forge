import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'dueDate', column: 'DueDate', type: 'date', label: 'Due Date' },
  { key: 'expected', column: 'ExpectedAmount', type: 'amount', label: 'Expected Amount' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Paid Amount', required: true },
  { key: 'orderNo', column: 'DocumentNo', type: 'string', label: 'Order No.', required: true },
  { key: 'invoiceNo', column: 'DocumentNo', type: 'string', label: 'Invoice No.', required: true },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'selector', label: 'Business Partner' },
];
// @sf-generated-end columns:lines

const filters = [];

// @sf-generated-start component:LinesTable
const LinesTable = forwardRef(function LinesTable(props, ref) {
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

export default LinesTable;
// @sf-generated-end component:LinesTable
