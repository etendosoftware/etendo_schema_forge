import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPaymentExecHistoryV
const fields = [
  { key: 'executionDate', column: 'Executiondate', type: 'date', section: 'principal' },
  { key: 'paymentRun', column: 'FIN_Payment_Run_ID', type: 'search', section: 'principal', reference: 'Payment_Run', inputMode: 'search' },
  { key: 'paymentRunStatus', column: 'Prun_Status', type: 'text', section: 'principal' },
  { key: 'paymentRunMessage', column: 'Prun_Message', type: 'text', section: 'principal' },
  { key: 'sourceOfTheExecution', column: 'Prun_Source', type: 'text', section: 'other' },
  { key: 'paymentExecutionResult', column: 'Paymentexec_Result', type: 'text', section: 'other' },
  { key: 'paymentExecutionMessage', column: 'Paymentexec_Message', type: 'text', section: 'other' },
];
// @sf-generated-end fields:finPaymentExecHistoryV

// @sf-generated-start component:FinPaymentExecHistoryVForm
export default function FinPaymentExecHistoryVForm(props) {
  // @sf-custom-slot hooks:FinPaymentExecHistoryVForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentExecHistoryVForm

// @sf-custom-slot section:FinPaymentExecHistoryVForm-custom
