import { forwardRef } from 'react';
import InvoiceLinesTable from '../shared/InvoiceLinesTable.jsx';

// Mirrors the generated LinesTable pattern (artifacts/sales-invoice/generated/.../LinesTable.jsx):
// when linesLayout==='inlineEditable' and we're NOT in add-line mode, render via
// InlineLinesPanel so hover row actions (pencil, trash) and the inline edit flow
// work. The add-line path keeps using DataTable for its proven InlineAddRow.
const SalesInvoiceLinesTable = forwardRef(function SalesInvoiceLinesTable(props, ref) {
  return <InvoiceLinesTable ref={ref} {...props} data-testid="InvoiceLinesTable__794381" />;
});

export default SalesInvoiceLinesTable;
