import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:Dimensiones
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'type', column: 'ElementType', type: 'enum', label: 'Type', enumLabels: { 'AC': 'elementTypeAc', 'AY': 'elementTypeAy', 'AS': 'elementTypeAs', 'BP': 'elementTypeBp', 'MC': 'elementTypeMc', 'CC': 'elementTypeCc', 'LF': 'elementTypeLf', 'LT': 'elementTypeLt', 'OO': 'elementTypeOo', 'PR': 'elementTypePr', 'PJ': 'elementTypePj', 'SR': 'elementTypeSr', 'OT': 'elementTypeOt', 'U1': 'elementTypeU1', 'U2': 'elementTypeU2' }, required: true },
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
