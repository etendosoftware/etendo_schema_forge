import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:executionHistory
const columns = [
  { key: 'executionDate', column: 'Executiondate', type: 'date', label: 'Execution Date' },
  { key: 'paymentRunStatus', column: 'Prun_Status', type: 'status', label: 'Payment Out Run Status', enumLabels: { 'E': 'Executed', 'PE': 'Partially Executed', 'P': 'Pending' } },
  { key: 'paymentExecutionResult', column: 'Paymentexec_Result', type: 'enum', label: 'Payment Out Execution Result', enumLabels: { 'E': 'Error', 'P': 'Pending', 'S': 'Successful' } },
  { key: 'paymentExecutionMessage', column: 'Paymentexec_Message', type: 'string', label: 'Payment Out Execution Message' },
];
// @sf-generated-end columns:executionHistory

const filters = [];

// @sf-generated-start component:ExecutionHistoryTable
const ExecutionHistoryTable = forwardRef(function ExecutionHistoryTable(props, ref) {
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

export default ExecutionHistoryTable;
// @sf-generated-end component:ExecutionHistoryTable
