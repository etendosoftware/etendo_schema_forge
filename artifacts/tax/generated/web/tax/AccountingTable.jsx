import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:accounting
const columns = [
  { key: 'taxDue', column: 'T_Due_Acct', type: 'selector', label: 'Tax Due', required: true, grow: true },
  { key: 'taxCredit', column: 'T_Credit_Acct', type: 'selector', label: 'Tax Credit', required: true, grow: true },
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
