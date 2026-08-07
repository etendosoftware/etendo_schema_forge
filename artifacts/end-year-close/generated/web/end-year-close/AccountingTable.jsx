import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:accounting
const columns = [
  { key: 'account', column: 'Account_ID', type: 'string', label: 'Account' },
  { key: 'debit', column: 'Debit', type: 'amount', label: 'Debit' },
  { key: 'credit', column: 'Credit', type: 'amount', label: 'Credit' },
  { key: 'type', column: 'Factaccttype', type: 'enum', label: 'Type', enumLabels: { 'C': 'factaccttypeC', 'D': 'factaccttypeD', 'R': 'factaccttypeR', 'O': 'factaccttypeO', 'N': 'factaccttypeN' } },
  { key: 'description', column: 'description', type: 'string', label: 'Description' },
];
// @sf-generated-end columns:accounting

const filters = [];

// @sf-generated-start component:AccountingTable
const AccountingTable = forwardRef(function AccountingTable(props, ref) {
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

export default AccountingTable;
// @sf-generated-end component:AccountingTable
