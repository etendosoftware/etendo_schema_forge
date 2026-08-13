import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:exchangeRates
const columns = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true },
  { key: 'toCurrency', column: 'C_Currency_Id_To', type: 'selector', label: 'To Currency', required: true, readOnly: true },
  { key: 'rate', column: 'Rate', type: 'string', label: 'Rate' },
  { key: 'foreignAmount', column: 'Foreign_Amount', type: 'amount', label: 'Foreign  Amount', required: true },
];
// @sf-generated-end columns:exchangeRates

const filters = [];

// @sf-generated-start component:ExchangeRatesTable
const ExchangeRatesTable = forwardRef(function ExchangeRatesTable(props, ref) {
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

export default ExchangeRatesTable;
// @sf-generated-end component:ExchangeRatesTable
