import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:paymentDetails
const columns = [
  { key: 'payment', column: 'FIN_Payment_ID', type: 'selector', label: 'Payment Out', required: true },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method' },
  { key: 'expected', column: 'Expected', type: 'amount', label: 'Expected Amount' },
  { key: 'paidAmount', column: 'Paidamt', type: 'amount', label: 'Paid Amount', required: true },
  { key: 'status', column: 'Status', type: 'status', label: 'Status', enumLabels: { 'RPAP': 'Awaiting Payment', 'RPAE': 'Awaiting Execution', 'RPVOID': 'Void', 'PPM': 'Payment Made', 'RPR': 'Payment Received', 'RDNC': 'Deposited not Cleared', 'PWNC': 'Withdrawn not Cleared', 'RPPC': 'Payment Cleared' }, required: true },
];
// @sf-generated-end columns:paymentDetails

const filters = [];

// @sf-generated-start component:PaymentDetailsTable
const PaymentDetailsTable = forwardRef(function PaymentDetailsTable(props, ref) {
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

export default PaymentDetailsTable;
// @sf-generated-end component:PaymentDetailsTable
