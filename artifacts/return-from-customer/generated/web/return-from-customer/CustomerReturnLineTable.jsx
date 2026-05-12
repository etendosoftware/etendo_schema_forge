import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:customerReturnLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true },
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Returned Quantity', required: true },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true },
  { key: 'unitPrice', column: 'PriceActual', type: 'number', label: 'Net Unit Price', required: true },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', label: 'Line Net Amount', required: true },
  { key: 'lineGrossAmount', column: 'Line_Gross_Amount', type: 'amount', label: 'Line Gross Amount' },
  { key: 'goodsShipmentLine', column: 'M_Inoutline_ID', type: 'selector', label: 'Goods Shipment Line' },
];
// @sf-generated-end columns:customerReturnLine

const filters = ['goodsShipmentLine'];

// @sf-generated-start component:CustomerReturnLineTable
const CustomerReturnLineTable = forwardRef(function CustomerReturnLineTable(props, ref) {
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

export default CustomerReturnLineTable;
// @sf-generated-end component:CustomerReturnLineTable
