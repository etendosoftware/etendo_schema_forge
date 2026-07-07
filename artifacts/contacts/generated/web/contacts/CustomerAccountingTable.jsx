import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:customerAccounting
const columns = [
  { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', type: 'selector', labels: {"en_US":"Receivables Account","es_ES":"Cuenta a Cobrar"}, label: 'Customer Receivables No.', required: true },
  { key: 'customerPrepayment', column: 'C_Prepayment_Acct', type: 'selector', labels: {"en_US":"Prepayment Account","es_ES":"Cuenta de Anticipos"}, label: 'Customer Prepayment' },
];
// @sf-generated-end columns:customerAccounting

const filters = [];

// @sf-generated-start component:CustomerAccountingTable
const CustomerAccountingTable = forwardRef(function CustomerAccountingTable(props, ref) {
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

export default CustomerAccountingTable;
// @sf-generated-end component:CustomerAccountingTable
