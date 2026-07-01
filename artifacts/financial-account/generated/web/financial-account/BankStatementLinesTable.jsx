import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:bankStatementLines
const columns = [
  { key: 'transactionDate', column: 'Datetrx', type: 'date', label: 'Transaction Date', required: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  { key: 'bpartnername', column: 'Bpartnername', type: 'string', label: 'Business Partner Name' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'gLItem', column: 'C_Glitem_ID', type: 'selector', label: 'G/L Item' },
  { key: 'referenceNo', column: 'Referenceno', type: 'string', label: 'Reference No.', required: true },
  { key: 'dramount', column: 'Dramount', type: 'amount', label: 'Amount OUT', required: true },
  { key: 'cramount', column: 'Cramount', type: 'amount', label: 'Amount IN', required: true },
];
// @sf-generated-end columns:bankStatementLines

const filters = [];

// @sf-generated-start component:BankStatementLinesTable
const BankStatementLinesTable = forwardRef(function BankStatementLinesTable(props, ref) {
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

export default BankStatementLinesTable;
// @sf-generated-end component:BankStatementLinesTable
