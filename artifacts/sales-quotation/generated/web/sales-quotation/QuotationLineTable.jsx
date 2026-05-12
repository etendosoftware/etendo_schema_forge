import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:quotationLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true, lookup: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity', required: true },
  { key: 'listPrice', column: 'PriceList', type: 'amount', label: 'Net List Price', required: true },
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', required: true },
  { key: 'lineGrossAmount', column: 'Line_Gross_Amount', type: 'amount', label: 'Line Gross Amount' },
];
// @sf-generated-end columns:quotationLine

const filters = ['product'];

// @sf-generated-start component:QuotationLineTable
const QuotationLineTable = forwardRef(function QuotationLineTable(props, ref) {
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

export default QuotationLineTable;
// @sf-generated-end component:QuotationLineTable
