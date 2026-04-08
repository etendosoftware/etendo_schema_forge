import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPaymentScheduleDetail
const fields = [
  { key: 'dueDate', column: 'DueDate', type: 'date', readOnly: true, section: 'other' },
  { key: 'amount', column: 'Amount', type: 'number', required: true, section: 'principal', defaultValue: '0' },
  { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', section: 'principal', reference: 'Payment_Schedule', inputMode: 'search' },
];
// @sf-generated-end fields:finPaymentScheduleDetail

// @sf-generated-start component:FinPaymentScheduleDetailForm
export default function FinPaymentScheduleDetailForm(props) {
  // @sf-custom-slot hooks:FinPaymentScheduleDetailForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentScheduleDetailForm

// @sf-custom-slot section:FinPaymentScheduleDetailForm-custom
