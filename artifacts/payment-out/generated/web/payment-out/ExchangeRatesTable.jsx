import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:exchangeRates
const columns = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true },
  { key: 'toCurrency', column: 'C_Currency_Id_To', type: 'selector', label: 'To Currency', required: true },
  { key: 'rate', column: 'Rate', type: 'string', label: 'Rate' },
  { key: 'foreignAmount', column: 'Foreign_Amount', type: 'amount', label: 'Foreign  Amount', required: true },
];
// @sf-generated-end columns:exchangeRates

const filters = [];

// @sf-generated-start component:ExchangeRatesTable
const ExchangeRatesTable = forwardRef(function ExchangeRatesTable(props, ref) {
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

export default ExchangeRatesTable;
// @sf-generated-end component:ExchangeRatesTable
