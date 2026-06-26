import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentDetails
const fields = [
  { key: 'payment', column: 'FIN_Payment_ID', type: 'search', label: 'Payment Out', required: true, readOnly: true, section: 'other', reference: 'Payment' },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date', readOnly: true, section: 'other' },
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Due Date', readOnly: true, section: 'other' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'search', label: 'Payment Method', readOnly: true, section: 'other', reference: 'PaymentMethod' },
  { key: 'finFinancialAccountID', column: 'Fin_Financial_Account_ID', type: 'search', label: 'Financial Account', readOnly: true, section: 'other', reference: 'FinancialAccount' },
  { key: 'expected', column: 'Expected', type: 'number', label: 'Expected Amount', readOnly: true, section: 'other' },
  { key: 'paidAmount', column: 'Paidamt', type: 'number', label: 'Paid Amount', required: true, readOnly: true, section: 'other' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'number', label: 'Write-off Amount', readOnly: true, section: 'other' },
  { key: 'expectedConverted', column: 'ExpectedConverted', type: 'number', label: 'Expected (Account Currency)', readOnly: true, section: 'other' },
  { key: 'paidConverted', column: 'PaidConverted', type: 'number', label: 'Paid (Account Currency)', readOnly: true, section: 'other' },
  { key: 'finaccTxnConvertRate', column: 'Finacc_Txn_Convert_Rate', type: 'text', label: 'Exchange Rate', readOnly: true, section: 'other' },
  { key: 'canceled', column: 'Iscanceled', type: 'checkbox', label: 'Canceled', readOnly: true, section: 'other' },
  { key: 'status', column: 'Status', type: 'select', label: 'Status', required: true, readOnly: true, section: 'other', options: [{ value: 'RPAP', label: 'Awaiting Payment' }, { value: 'RPAE', label: 'Awaiting Execution' }, { value: 'RPVOID', label: 'Void' }, { value: 'PPM', label: 'Payment Made' }, { value: 'RPR', label: 'Payment Received' }, { value: 'RDNC', label: 'Deposited not Cleared' }, { value: 'PWNC', label: 'Withdrawn not Cleared' }, { value: 'RPPC', label: 'Payment Cleared' }] },
];
// @sf-generated-end fields:paymentDetails

// @sf-generated-start component:PaymentDetailsForm
export default function PaymentDetailsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:PaymentDetailsForm
