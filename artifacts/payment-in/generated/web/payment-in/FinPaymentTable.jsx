import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:finPayment
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'selector', label: 'Received From' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Amount', required: true },
  { key: 'status', column: 'Status', type: 'status', label: 'Status', enumLabels: { 'RPAP': 'statusRpap', 'RPAE': 'statusRpae', 'RPVOID': 'statusRpvoid', 'PPM': 'statusPpm', 'RPR': 'statusRpr', 'RDNC': 'statusRdnc', 'PWNC': 'statusPwnc', 'RPPC': 'statusRppc', 'ETGOERR': 'statusEtgoerr' }, required: true },
];
// @sf-generated-end columns:finPayment

const filters = ['documentNo', 'paymentDate', 'businessPartner'];

// @sf-generated-start component:FinPaymentTable
const FinPaymentTable = forwardRef(function FinPaymentTable(props, ref) {
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

export default FinPaymentTable;
// @sf-generated-end component:FinPaymentTable
