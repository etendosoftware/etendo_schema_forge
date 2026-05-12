import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:goodsReceiptLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true },
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin' },
  { key: 'invoiceQuantity', column: 'Qtyinvoiced', type: 'number', label: 'Invoiced Quantity', required: true },
];
// @sf-generated-end columns:goodsReceiptLine

const filters = [];

// @sf-generated-start component:GoodsReceiptLineTable
const GoodsReceiptLineTable = forwardRef(function GoodsReceiptLineTable(props, ref) {
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

export default GoodsReceiptLineTable;
// @sf-generated-end component:GoodsReceiptLineTable
