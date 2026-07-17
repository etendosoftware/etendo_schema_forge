import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', lookup: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: 'Invoiced Quantity', required: true, min: 0 },
  { key: 'listPrice', column: 'PriceList', type: 'amount', label: 'List Price', required: true, min: 0 },
  { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: 'Discount %', min: 0, max: 100 },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax' },
  { key: 'grossAmount', column: 'Line_Gross_Amount', type: 'amount', label: 'Line Gross Amount' },
];
// @sf-generated-end columns:lines

const filters = ['product'];

// @sf-generated-start component:LinesTable
const LinesTable = forwardRef(function LinesTable(props, ref) {
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

export default LinesTable;
// @sf-generated-end component:LinesTable
