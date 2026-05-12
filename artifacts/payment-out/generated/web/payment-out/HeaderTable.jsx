import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'selector', label: 'Paying To' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Amount', required: true },
  { key: 'status', column: 'Status', type: 'status', label: 'Status', enumLabels: { 'RPAP': 'Awaiting Payment', 'RPAE': 'Awaiting Execution', 'RPVOID': 'Void', 'PPM': 'Payment Made', 'RPR': 'Payment Received', 'RDNC': 'Deposited not Cleared', 'PWNC': 'Withdrawn not Cleared', 'RPPC': 'Payment Cleared' }, required: true },
];
// @sf-generated-end columns:header

const filters = ['documentNo', 'referenceNo', 'paymentDate', 'businessPartner', 'status'];

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
