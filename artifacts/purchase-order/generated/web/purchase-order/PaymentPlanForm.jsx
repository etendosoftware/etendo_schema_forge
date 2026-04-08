import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentPlan
const fields = [
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Due Date', readOnly: true, section: 'other' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'search', label: 'Payment Method', required: true, readOnly: true, section: 'other', reference: 'PaymentMethod' },
  { key: 'expected', column: 'Expected', type: 'number', label: 'Expected Amount', required: true, readOnly: true, section: 'other' },
  { key: 'received', column: 'Received', type: 'number', label: 'Paid', required: true, readOnly: true, section: 'other' },
  { key: 'outstanding', column: 'Outstanding', type: 'number', label: 'Outstanding', required: true, readOnly: true, section: 'other' },
  { key: 'lastPayment', column: 'Lastpayment', type: 'date', label: 'Last Payment Date', readOnly: true, section: 'other' },
  { key: 'numberOfPayments', column: 'Numberofpayments', type: 'number', label: 'Number of Payments', readOnly: true, section: 'other' },
  { key: 'currency', column: 'C_Currency_ID', type: 'search', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency' },
];
// @sf-generated-end fields:paymentPlan

// @sf-generated-start component:PaymentPlanForm
export default function PaymentPlanForm(props) {
  // @sf-custom-slot hooks:PaymentPlanForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PaymentPlanForm

// @sf-custom-slot section:PaymentPlanForm-custom
