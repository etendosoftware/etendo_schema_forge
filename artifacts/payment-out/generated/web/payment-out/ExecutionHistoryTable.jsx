import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:executionHistory
const columns = [
  { key: 'executionDate', column: 'Executiondate', type: 'date', label: 'Execution Date' },
  { key: 'paymentRunStatus', column: 'Prun_Status', type: 'status', label: 'Payment Out Run Status' },
  { key: 'paymentExecutionResult', column: 'Paymentexec_Result', type: 'enum', label: 'Payment Out Execution Result', enumLabels: { 'E': 'Error', 'P': 'Pending', 'S': 'Successful' } },
  { key: 'paymentExecutionMessage', column: 'Paymentexec_Message', type: 'string', label: 'Payment Out Execution Message' },
];
// @sf-generated-end columns:executionHistory

const filters = [];

// @sf-generated-start component:ExecutionHistoryTable
export default function ExecutionHistoryTable(props) {
  // @sf-custom-slot hooks:ExecutionHistoryTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ExecutionHistoryTable

// @sf-custom-slot section:ExecutionHistoryTable-custom
