import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:lineTax
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', required: true },
  { key: 'taxableAmount', column: 'Taxbaseamt', type: 'amount', label: 'Taxable Amount', required: true },
  { key: 'taxAmount', column: 'Taxamt', type: 'amount', label: 'Tax Amount', required: true },
];
// @sf-generated-end columns:lineTax

const filters = [];

// @sf-generated-start component:LineTaxTable
const LineTaxTable = forwardRef(function LineTaxTable(props, ref) {
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

export default LineTaxTable;
// @sf-generated-end component:LineTaxTable
