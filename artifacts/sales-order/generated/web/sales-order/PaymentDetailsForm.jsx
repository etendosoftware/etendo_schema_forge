import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentDetails
const fields = [
  { key: 'payment', column: 'FIN_Payment_ID', type: 'selector', required: true, section: 'principal', reference: 'Payment', inputMode: 'selector' },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', readOnly: true, section: 'other' },
  { key: 'dueDate', column: 'Duedate', type: 'date', readOnly: true, section: 'other' },
  { key: 'expectedAmount', column: 'Expected', type: 'number', readOnly: true, section: 'other' },
  { key: 'paidAmount', column: 'Paidamt', type: 'number', required: true, section: 'principal' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'number', section: 'principal' },
  { key: 'expectedAccountCurrency', column: 'ExpectedConverted', type: 'number', readOnly: true, section: 'other' },
  { key: 'receivedAccountCurrency', column: 'PaidConverted', type: 'number', readOnly: true, section: 'other' },
  { key: 'exchangeRate', column: 'Finacc_Txn_Convert_Rate', type: 'text', readOnly: true, section: 'other' },
  { key: 'canceled', column: 'Iscanceled', type: 'checkbox', readOnly: true, section: 'other' },
  { key: 'status', column: 'Status', type: 'select', required: true, readOnly: true, section: 'other', options: [{ value: 'RPAP', label: 'Awaiting Payment' }, { value: 'RPAE', label: 'Awaiting Execution' }, { value: 'RPVOID', label: 'Void' }, { value: 'PPM', label: 'Payment Made' }, { value: 'RPR', label: 'Payment Received' }, { value: 'RDNC', label: 'Deposited not Cleared' }, { value: 'PWNC', label: 'Withdrawn not Cleared' }, { value: 'RPPC', label: 'Payment Cleared' }] },
];
// @sf-generated-end fields:paymentDetails

// @sf-generated-start component:PaymentDetailsForm
export default function PaymentDetailsForm(props) {
  // @sf-custom-slot hooks:PaymentDetailsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PaymentDetailsForm

// @sf-custom-slot section:PaymentDetailsForm-custom
