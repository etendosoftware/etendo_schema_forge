import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:costing
const columns = [
  { key: 'costType', column: 'Costtype', type: 'enum', label: 'Cost Type', enumLabels: { 'AVA': 'costtypeAva', 'STA': 'costtypeSta' }, required: true },
  { key: 'cost', column: 'Cost', type: 'number', label: 'Cost' },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date', required: true },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date', required: true },
  { key: 'quantity', column: 'Qty', type: 'number', label: 'Quantity' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse' },
];
// @sf-generated-end columns:costing

const filters = [];

// @sf-generated-start component:CostingTable
const CostingTable = forwardRef(function CostingTable(props, ref) {
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

export default CostingTable;
// @sf-generated-end component:CostingTable
