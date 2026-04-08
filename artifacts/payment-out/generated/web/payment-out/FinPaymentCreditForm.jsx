import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPaymentCredit
const fields = [
  { key: 'creditPaymentUsed', column: 'FIN_Payment_Id_Used', type: 'search', required: true, section: 'principal', reference: 'Payment', inputMode: 'search' },
  { key: 'amount', column: 'Amount', type: 'text', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector' },
];
// @sf-generated-end fields:finPaymentCredit

// @sf-generated-start component:FinPaymentCreditForm
export default function FinPaymentCreditForm(props) {
  // @sf-custom-slot hooks:FinPaymentCreditForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentCreditForm

// @sf-custom-slot section:FinPaymentCreditForm-custom
