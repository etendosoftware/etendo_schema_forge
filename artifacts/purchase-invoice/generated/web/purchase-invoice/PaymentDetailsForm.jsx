import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentDetails
const fields = [
  { key: 'amount', column: 'Amount', type: 'number', label: 'Received Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'number', label: 'Write-off Amount', readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'amount2', column: 'Amount', type: 'number', label: 'Amount', required: true, section: 'principal', defaultValue: '0' },
  { key: 'canceled', column: 'Iscanceled', type: 'checkbox', label: 'Canceled', required: true, readOnly: true, section: 'other', defaultValue: 'N' },
  { key: 'finPaymentID', column: 'Fin_Payment_ID', type: 'selector', label: 'Payment', required: true, readOnly: true, section: 'other', reference: 'Payment', inputMode: 'selector' },
  { key: 'invoicePaid', column: 'Isinvoicepaid', type: 'checkbox', label: 'Invoice Paid', required: true, readOnly: true, section: 'other', defaultValue: 'N' },
];
// @sf-generated-end fields:paymentDetails

// @sf-generated-start component:PaymentDetailsForm
export default function PaymentDetailsForm(props) {
  // @sf-custom-slot hooks:PaymentDetailsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PaymentDetailsForm

// @sf-custom-slot section:PaymentDetailsForm-custom
