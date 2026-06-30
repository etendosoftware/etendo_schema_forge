import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:Dimensiones
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'type', column: 'ElementType', type: 'enum', label: 'Type', enumLabels: { 'AC': 'Account', 'AY': 'Activity', 'AS': 'Asset', 'BP': 'Bus.Partner', 'MC': 'Campaign', 'CC': 'Cost Center', 'LF': 'Location From', 'LT': 'Location To', 'OO': 'Organization', 'PR': 'Product', 'PJ': 'Project', 'SR': 'Sales Region', 'OT': 'Trx. Org', 'U1': 'User 1', 'U2': 'User 2' }, required: true },
  { key: 'active', column: 'IsActive', type: 'boolean', label: 'Active', required: true },
  { key: 'mandatory', column: 'IsMandatory', type: 'boolean', label: 'Mandatory', required: true },
  { key: 'balanced', column: 'IsBalanced', type: 'boolean', label: 'Balanced', required: true },
];
// @sf-generated-end columns:Dimensiones

const filters = [];

// @sf-generated-start component:DimensionesTable
const DimensionesTable = forwardRef(function DimensionesTable(props, ref) {
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

export default DimensionesTable;
// @sf-generated-end component:DimensionesTable
