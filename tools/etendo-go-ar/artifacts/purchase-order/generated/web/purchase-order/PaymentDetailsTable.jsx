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

export default PaymentDetailsTable;
// @sf-generated-end component:PaymentDetailsTable
