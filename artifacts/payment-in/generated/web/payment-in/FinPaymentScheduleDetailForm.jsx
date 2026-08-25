import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPaymentScheduleDetail
const fields = [
  { key: 'dueDate', column: 'DueDate', type: 'date', label: 'Due Date', readOnly: true, section: 'other' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Received Amount', required: true, section: 'principal', defaultValue: '0' },
  { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', label: 'Invoice Payment Schedule', section: 'principal', reference: 'Payment_Schedule', inputMode: 'search' },
];
// @sf-generated-end fields:finPaymentScheduleDetail

// @sf-generated-start component:FinPaymentScheduleDetailForm
export default function FinPaymentScheduleDetailForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
FinPaymentScheduleDetailForm.fields = fields;

// @sf-generated-end component:FinPaymentScheduleDetailForm
