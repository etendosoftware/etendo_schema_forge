import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:conversionRate
const columns = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true },
  { key: 'toCurrency', column: 'C_Currency_ID_To', type: 'selector', label: 'To Currency', required: true },
  { key: 'validFromDate', column: 'ValidFrom', type: 'date', label: 'Valid From Date', required: true },
  { key: 'validToDate', column: 'ValidTo', type: 'date', label: 'Valid To Date' },
  { key: 'multipleRateBy', column: 'MultiplyRate', type: 'string', label: 'Multiple Rate By', required: true },
  { key: 'divideRateBy', column: 'DivideRate', type: 'string', label: 'Divide Rate By', required: true },
  { key: 'sMFCRSynced', column: 'EM_SMFCR_Is_Synced', type: 'boolean', label: 'Synced' },
];
// @sf-generated-end columns:conversionRate

const filters = ['currency', 'toCurrency'];

// @sf-generated-start component:ConversionRateTable
const ConversionRateTable = forwardRef(function ConversionRateTable(props, ref) {
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

export default ConversionRateTable;
// @sf-generated-end component:ConversionRateTable
