import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPayment
const fields = [
  // Row 1
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'principal' },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', section: 'principal', defaultValue: '@#Date@' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', section: 'principal', reference: 'BPartner', inputMode: 'search' },
  { key: 'amount', column: 'Amount', type: 'number', required: true, section: 'principal', defaultValue: '0' },
  // Row 2
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'search', required: true, section: 'principal', reference: 'Paymentmethod', inputMode: 'search' },
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'dependent', required: true, section: 'principal', reference: 'Financial_Account', inputMode: 'dependent', dependsOn: { field: 'paymentMethod', filterKey: 'Fin_Paymentmethod_ID' } },
];
// @sf-generated-end fields:finPayment

// @sf-generated-start component:FinPaymentForm
export default function FinPaymentForm(props) {
  // @sf-custom-slot hooks:FinPaymentForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentForm

// @sf-custom-slot section:FinPaymentForm-custom
