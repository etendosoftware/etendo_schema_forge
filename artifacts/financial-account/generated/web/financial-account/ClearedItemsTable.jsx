import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:clearedItems
const columns = [
  { key: 'transactionDate', column: 'Statementdate', type: 'date', label: 'Transaction Date' },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  { key: 'financialAccountTransaction', column: 'FIN_Finacc_Transaction_ID', type: 'selector', label: 'Financial account transaction' },
  { key: 'payment', column: 'FIN_Payment_ID', type: 'selector', label: 'Payment' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency' },
  { key: 'transactionType', column: 'Trxtype', type: 'enum', label: 'Transaction Type', enumLabels: { 'BPD': 'BP Deposit', 'BPW': 'BP Withdrawal', 'BF': 'Bank fee' } },
  { key: 'gLItem', column: 'C_Glitem_ID', type: 'selector', label: 'G/L Item' },
];
// @sf-generated-end columns:clearedItems

const filters = [];

// @sf-generated-start component:ClearedItemsTable
const ClearedItemsTable = forwardRef(function ClearedItemsTable(props, ref) {
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

export default ClearedItemsTable;
// @sf-generated-end component:ClearedItemsTable
