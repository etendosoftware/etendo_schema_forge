import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';
import { useCurrency } from '@/hooks/useCurrency';

// product/tax are `selector` (not `string`) so InlineLinesPanel renders a
// lookup / dropdown in edit mode instead of showing the raw FK id.
const columns = [
  { key: 'product',          column: 'M_Product_ID',       type: 'selector', label: 'Product', required: true, lookup: true },
  { key: 'description',      column: 'Description',         type: 'string', label: 'Description' },
  { key: 'invoicedQuantity', column: 'QtyInvoiced',         type: 'number', label: 'Invoiced Quantity', required: true },
  { key: 'listPrice',        column: 'PriceList',            type: 'amount', label: 'Net Unit Price', required: true },
  { key: 'etgoDiscount',     column: 'EM_Etgo_Discount',    type: 'number', label: 'Discount %' },
  { key: 'tax',              column: 'C_Tax_ID',            type: 'selector', label: 'Tax', required: true },
  { key: 'grossAmount',      column: 'Line_Gross_Amount',   type: 'amount', label: 'Line Gross Amount' },
];

// forwardRef so DetailView can imperatively clear the selection / flush
// pending edits via inlineLinesRef. Mirrors the generated LinesTable pattern:
// when linesLayout='inlineEditable' and not in add-row mode, hand off to
// InlineLinesPanel for hover actions, inline edit, and clearSelection.
const InvoiceLineTableCustom = forwardRef(function InvoiceLineTableCustom({ data, ...props }, ref) {
  const currencyCode = useCurrency();
  const enrichedData = data?.map(row => ({
    ...row,
    'currency$_identifier': row['currency$_identifier'] ?? currencyCode,
  }));
  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return <InlineLinesPanel ref={ref} columns={columns} data={enrichedData} {...props} />;
  }
  return <DataTable columns={columns} filters={[]} data={enrichedData} {...props} />;
});

export default InvoiceLineTableCustom;
