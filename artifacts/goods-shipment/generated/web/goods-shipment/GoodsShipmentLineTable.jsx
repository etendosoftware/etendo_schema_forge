import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:goodsShipmentLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true },
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'number', label: 'Order Quantity' },
];
// @sf-generated-end columns:goodsShipmentLine

const filters = ['product'];

// @sf-generated-start component:GoodsShipmentLineTable
const GoodsShipmentLineTable = forwardRef(function GoodsShipmentLineTable(props, ref) {
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

export default GoodsShipmentLineTable;
// @sf-generated-end component:GoodsShipmentLineTable
