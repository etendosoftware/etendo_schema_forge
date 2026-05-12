import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:inventory
const columns = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse', required: true },
  { key: 'inventoryType', column: 'Inventory_Type', type: 'enum', label: 'Inventory Type', enumLabels: { 'C': 'Closing Inventory', 'N': 'Normal', 'O': 'Opening Inventory' }, required: true },
  { key: 'processed', column: 'Processed', type: 'status', label: 'Status', required: true },
];
// @sf-generated-end columns:inventory

const filters = ['movementDate', 'warehouse', 'inventoryType'];

// @sf-generated-start component:InventoryTable
const InventoryTable = forwardRef(function InventoryTable(props, ref) {
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

export default InventoryTable;
// @sf-generated-end component:InventoryTable
