import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:movementLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true },
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true, lookup: true },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', required: true },
  { key: 'newStorageBin', column: 'M_LocatorTo_ID', type: 'selector', label: 'New Storage Bin', required: true },
];
// @sf-generated-end columns:movementLine

const filters = ['product'];

// @sf-generated-start component:MovementLineTable
const MovementLineTable = forwardRef(function MovementLineTable(props, ref) {
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

export default MovementLineTable;
// @sf-generated-end component:MovementLineTable
