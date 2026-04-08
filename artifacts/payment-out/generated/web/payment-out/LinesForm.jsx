import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'dueDate', column: 'DueDate', type: 'date', label: 'Due Date', readOnly: true, section: 'principal' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Paid Amount', required: true, section: 'principal' },
  { key: 'expected', column: 'ExpectedAmount', type: 'number', label: 'Expected Amount', readOnly: true, section: 'principal' },
  { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', label: 'Invoice Payment Schedule', section: 'principal', reference: 'Payment_Schedule', inputMode: 'search' },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  // @sf-custom-slot hooks:LinesForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:LinesForm

// @sf-custom-slot section:LinesForm-custom
