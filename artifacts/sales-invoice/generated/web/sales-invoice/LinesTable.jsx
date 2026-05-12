import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', lookup: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: 'Invoiced Quantity', required: true },
  { key: 'listPrice', column: 'PriceList', type: 'amount', label: 'List Price', required: true },
  { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: 'Discount %' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax' },
  { key: 'grossAmount', column: 'Line_Gross_Amount', type: 'amount', label: 'Line Gross Amount' },
];
// @sf-generated-end columns:lines

const filters = ['product'];

// @sf-generated-start component:LinesTable
const LinesTable = forwardRef(function LinesTable(props, ref) {
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

export default LinesTable;
// @sf-generated-end component:LinesTable
