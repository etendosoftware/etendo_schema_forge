import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:alternateUom
const columns = [
  { key: 'uOM', column: 'C_Uom_ID', type: 'selector', label: 'UOM', required: true },
  { key: 'conversionRate', column: 'Conversionrate', type: 'number', label: 'Conversion Rate', required: true },
  { key: 'sales', column: 'Sales', type: 'enum', label: 'Sales', enumLabels: { 'P': 'salesP', 'S': 'salesS', 'NA': 'salesNa' }, required: true },
  { key: 'purchase', column: 'Purchase', type: 'enum', label: 'Purchase', enumLabels: { 'P': 'purchaseP', 'S': 'purchaseS', 'NA': 'purchaseNa' }, required: true },
  { key: 'logistics', column: 'Logistics', type: 'enum', label: 'Logistics', enumLabels: { 'P': 'logisticsP', 'S': 'logisticsS', 'NA': 'logisticsNa' }, required: true },
];
// @sf-generated-end columns:alternateUom

const filters = [];

// @sf-generated-start component:AlternateUomTable
const AlternateUomTable = forwardRef(function AlternateUomTable(props, ref) {
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

export default AlternateUomTable;
// @sf-generated-end component:AlternateUomTable
