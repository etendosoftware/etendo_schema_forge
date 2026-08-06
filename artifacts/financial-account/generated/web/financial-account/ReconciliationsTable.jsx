import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:reconciliations
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'transactionDate', column: 'Statementdate', type: 'date', label: 'Transaction Date', required: true },
  { key: 'startingbalance', column: 'Startingbalance', type: 'amount', label: 'Starting Balance', required: true },
  { key: 'endingBalance', column: 'Endingbalance', type: 'amount', label: 'Ending Balance', required: true },
  { key: 'documentStatus', column: 'Docstatus', type: 'status', label: 'Document Status', enumLabels: { 'CL': 'Closed', 'CO': 'Completed', 'DR': 'Draft', 'NA': 'Not Accepted', 'WP': 'Not Paid', 'RE': 'Re-Opened', 'TEMP': 'Temporal', 'IP': 'Under Way', '??': 'Unknown', 'VO': 'Voided' }, required: true },
  { key: 'posted', column: 'Posted', type: 'string', label: 'Posted', required: true },
];
// @sf-generated-end columns:reconciliations

const filters = [];

// @sf-generated-start component:ReconciliationsTable
const ReconciliationsTable = forwardRef(function ReconciliationsTable(props, ref) {
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

export default ReconciliationsTable;
// @sf-generated-end component:ReconciliationsTable
