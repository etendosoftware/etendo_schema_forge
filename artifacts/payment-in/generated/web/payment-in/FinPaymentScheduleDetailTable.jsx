import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:finPaymentScheduleDetail
const columns = [
  { key: 'invoiceDocumentNo', column: 'invoiceDocumentNo', type: 'string', label: 'Invoice' },
  { key: 'dueDate', column: 'DueDate', type: 'date', label: 'Due Date' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Received Amount', required: true },
];
// @sf-generated-end columns:finPaymentScheduleDetail

const filters = [];

// @sf-generated-start component:FinPaymentScheduleDetailTable
const FinPaymentScheduleDetailTable = forwardRef(function FinPaymentScheduleDetailTable(props, ref) {
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

export default FinPaymentScheduleDetailTable;
// @sf-generated-end component:FinPaymentScheduleDetailTable
