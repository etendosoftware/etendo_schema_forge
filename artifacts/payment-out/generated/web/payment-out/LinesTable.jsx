import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'invoiceDocumentNo', column: 'invoiceDocumentNo', type: 'string', label: 'Invoice' },
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

export default LinesTable;
// @sf-generated-end component:LinesTable
