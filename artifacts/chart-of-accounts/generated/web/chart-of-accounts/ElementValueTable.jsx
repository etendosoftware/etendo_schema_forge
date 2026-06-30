import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:elementValue
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string', label: 'Search Key', required: true },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'accountType', column: 'AccountType', type: 'enum', label: 'Account Type', enumLabels: { 'A': 'Asset', 'E': 'Expense', 'L': 'Liability', 'M': 'Memo', 'O': 'Owner\'s Equity', 'R': 'Revenue' }, required: true },
  { key: 'active', column: 'IsActive', type: 'boolean', label: 'Active', required: true },
];
// @sf-generated-end columns:elementValue

const filters = [];

// @sf-generated-start component:ElementValueTable
const ElementValueTable = forwardRef(function ElementValueTable(props, ref) {
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

export default ElementValueTable;
// @sf-generated-end component:ElementValueTable
