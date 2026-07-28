import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:gLJournalLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'LineNo', required: true },
  { key: 'accountingCombination', column: 'C_ValidCombination_ID', type: 'selector', label: 'Account', lookup: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  { key: 'foreignCurrencyDebit', column: 'AmtSourceDr', type: 'amount', labels: {"en_US":"Debit","es_ES":"Débito"}, label: 'Debit', required: true },
  { key: 'foreignCurrencyCredit', column: 'AmtSourceCr', type: 'amount', labels: {"en_US":"Credit","es_ES":"Crédito"}, label: 'Credit', required: true },
];
// @sf-generated-end columns:gLJournalLine

const filters = [];

// @sf-generated-start component:GLJournalLineTable
const GLJournalLineTable = forwardRef(function GLJournalLineTable(props, ref) {
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

export default GLJournalLineTable;
// @sf-generated-end component:GLJournalLineTable
