import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:usedCreditSource
const columns = [
  { key: 'creditPaymentUsed', column: 'FIN_Payment_Id_Used', type: 'selector', label: 'Credit Payment Used', required: true },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Amount', required: true },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true },
];
// @sf-generated-end columns:usedCreditSource

const filters = [];

// @sf-generated-start component:UsedCreditSourceTable
const UsedCreditSourceTable = forwardRef(function UsedCreditSourceTable(props, ref) {
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

export default UsedCreditSourceTable;
// @sf-generated-end component:UsedCreditSourceTable
