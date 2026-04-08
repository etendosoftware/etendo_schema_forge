import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPaymentScheduleDetail
const fields = [
  { key: 'amount', column: 'Amount', type: 'number', label: 'Received Amount', required: true, section: 'principal' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'number', label: 'Write-off Amount', section: 'principal' },
  // @sf-custom-slot callout:SE_Payment_MultiCurrency
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date', section: 'principal' },
  // @sf-custom-slot callout:SE_PaymentMethod_FinAccount
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'principal', reference: 'Paymentmethod', inputMode: 'selector' },
  { key: 'amount2', column: 'Amount', type: 'number', label: 'Amount', required: true, section: 'other' },
  // @sf-custom-slot callout:SE_Payment_FinAccount
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'dependent', label: 'Financial Account', required: true, section: 'other', reference: 'Financial_Account', inputMode: 'dependent', dependsOn: { field: 'paymentMethod', filterKey: 'Fin_Paymentmethod_ID' } },
  { key: 'status', column: 'Status', type: 'text', label: 'Status', required: true, section: 'other' },
  { key: 'canceled', column: 'Iscanceled', type: 'checkbox', label: 'Canceled', required: true, readOnly: true, section: 'other' },
  { key: 'finPaymentID', column: 'Fin_Payment_ID', type: 'selector', label: 'Payment', required: true, readOnly: true, section: 'other', reference: 'Payment', inputMode: 'selector' },
  { key: 'invoicePaid', column: 'Isinvoicepaid', type: 'checkbox', label: 'Invoice Paid', required: true, section: 'other' },
];
// @sf-generated-end fields:finPaymentScheduleDetail

// @sf-generated-start component:FinPaymentScheduleDetailForm
export default function FinPaymentScheduleDetailForm(props) {
  // @sf-custom-slot hooks:FinPaymentScheduleDetailForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentScheduleDetailForm

// @sf-custom-slot section:FinPaymentScheduleDetailForm-custom
