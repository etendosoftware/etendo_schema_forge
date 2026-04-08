import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPayment
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SE_Payment_BPartner
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', label: 'Paying To', section: 'principal', reference: 'BusinessPartner', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  // @sf-custom-slot callout:SE_Payment_FinAccount
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'selector', label: 'Paying From', required: true, section: 'principal', reference: 'FinancialAccount', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Payment_MultiCurrency
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date', section: 'principal' },
  // @sf-custom-slot callout:SE_PaymentMethod_FinAccount
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'principal', reference: 'PaymentMethod', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Payment_MultiCurrency
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector' },
  { key: 'referenceNo', column: 'Referenceno', type: 'text', label: 'Reference No.', section: 'collapsed' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'collapsed' },
];
// @sf-generated-end fields:finPayment

// @sf-generated-start component:FinPaymentForm
export default function FinPaymentForm(props) {
  // @sf-custom-slot hooks:FinPaymentForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentForm

// @sf-custom-slot section:FinPaymentForm-custom
