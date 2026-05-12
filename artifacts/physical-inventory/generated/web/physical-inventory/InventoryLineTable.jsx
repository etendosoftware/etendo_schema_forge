import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:inventoryLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true, lookup: true },
  { key: 'quantityCount', column: 'QtyCount', type: 'number', label: 'User Count', required: true },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true },
  { key: 'bookQuantity', column: 'QtyBook', type: 'number', label: 'System Count', required: true },
];
// @sf-generated-end columns:inventoryLine

const filters = [];

// @sf-generated-start component:InventoryLineTable
const InventoryLineTable = forwardRef(function InventoryLineTable(props, ref) {
  // Inline-editable layout owns rendering of the existing rows. The add-line flow keeps
  // using the proven DataTable inline-add row (callouts, focus management, defaults) —
  // when addRow.active flips on, we hand off to DataTable so the user can fill the new
  // line, then return to InlineLinesPanel once addRow.active flips off again. The ref
  // is forwarded so DetailView can imperatively flush pending edits on global save.
  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default InventoryLineTable;
// @sf-generated-end component:InventoryLineTable
