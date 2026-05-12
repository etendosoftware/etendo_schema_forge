import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:paymentPlan
const columns = [
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Due Date', required: true },
  { key: 'expectedDate', column: 'ExpectedDate', type: 'date', label: 'Expected Date', required: true },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Expected Amount', required: true },
  { key: 'paidAmount', column: 'Paidamt', type: 'amount', label: 'Paid Amount', required: true },
  { key: 'outstandingAmount', column: 'Outstandingamt', type: 'amount', label: 'Outstanding Amount', required: true },
];
// @sf-generated-end columns:paymentPlan

const filters = [];

// @sf-generated-start component:PaymentPlanTable
const PaymentPlanTable = forwardRef(function PaymentPlanTable(props, ref) {
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

export default PaymentPlanTable;
// @sf-generated-end component:PaymentPlanTable
