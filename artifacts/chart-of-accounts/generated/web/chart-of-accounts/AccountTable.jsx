import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:account
const columns = [
  { key: 'code', column: 'Code', type: 'string', required: true },
  { key: 'name', column: 'Name', type: 'string', required: true },
  { key: 'accountType', column: 'AccountType', type: 'string', required: true },
  { key: 'parentAccount', column: 'Parent_ID', type: 'selector' },
  { key: 'debit', column: 'Debit', type: 'amount', required: true },
  { key: 'credit', column: 'Credit', type: 'amount', required: true },
  { key: 'balance', column: 'Balance', type: 'amount', required: true },
  { key: 'isActive', column: 'IsActive', type: 'boolean', required: true },
];
// @sf-generated-end columns:account

const filters = ['code', 'name', 'accountType'];

// @sf-generated-start component:AccountTable
const AccountTable = forwardRef(function AccountTable(props, ref) {
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

export default AccountTable;
// @sf-generated-end component:AccountTable
