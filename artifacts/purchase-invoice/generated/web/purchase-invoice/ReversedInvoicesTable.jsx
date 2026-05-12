import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:reversedInvoices
const columns = [
  { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', type: 'selector', label: 'Reversed Invoice', required: true },
];
// @sf-generated-end columns:reversedInvoices

const filters = [];

// @sf-generated-start component:ReversedInvoicesTable
const ReversedInvoicesTable = forwardRef(function ReversedInvoicesTable(props, ref) {
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

export default ReversedInvoicesTable;
// @sf-generated-end component:ReversedInvoicesTable
