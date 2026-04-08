import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:executionHistory
const fields = [
  { key: 'executionDate', column: 'Executiondate', type: 'date', label: 'Execution Date', readOnly: true, section: 'other' },
  { key: 'paymentRun', column: 'FIN_Payment_Run_ID', type: 'search', label: 'Payment Run', readOnly: true, section: 'other', reference: 'Payment_Run', inputMode: 'search' },
  { key: 'paymentRunStatus', column: 'Prun_Status', type: 'select', label: 'Payment Out Run Status', readOnly: true, section: 'other', options: [{ value: 'E', label: 'Executed' }, { value: 'PE', label: 'Partially Executed' }, { value: 'P', label: 'Pending' }] },
  { key: 'paymentRunMessage', column: 'Prun_Message', type: 'text', label: 'Payment Out Run Message', readOnly: true, section: 'other' },
  { key: 'sourceOfTheExecution', column: 'Prun_Source', type: 'select', label: 'Source of the Execution', readOnly: true, section: 'other', options: [{ value: 'AIP', label: 'Automatically from Invoice Process' }, { value: 'APP', label: 'Automatically from Payment Process' }, { value: 'MF', label: 'Execute Payments Form' }, { value: 'OTHER', label: 'Other Source' }, { value: 'PPW', label: 'Payment Proposal Window' }, { value: 'PW', label: 'Payments Window' }] },
  { key: 'paymentExecutionResult', column: 'Paymentexec_Result', type: 'select', label: 'Payment Out Execution Result', readOnly: true, section: 'other', options: [{ value: 'E', label: 'Error' }, { value: 'P', label: 'Pending' }, { value: 'S', label: 'Successful' }] },
  { key: 'paymentExecutionMessage', column: 'Paymentexec_Message', type: 'text', label: 'Payment Out Execution Message', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:executionHistory

// @sf-generated-start component:ExecutionHistoryForm
export default function ExecutionHistoryForm(props) {
  // @sf-custom-slot hooks:ExecutionHistoryForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ExecutionHistoryForm

// @sf-custom-slot section:ExecutionHistoryForm-custom
