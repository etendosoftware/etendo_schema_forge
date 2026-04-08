import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentOut
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Payment To', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'selector', label: 'Payment From', required: true, section: 'principal', reference: 'FinancialAccount', inputMode: 'selector' },
  { key: 'paymentDate', column: 'PaymentDate', type: 'date', label: 'Payment Date', required: true, section: 'principal' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'principal', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'currency', column: 'C_Currency_ID', type: 'text', label: 'Currency', required: true, section: 'principal' },
  { key: 'referenceNo', column: 'Referenceno', type: 'text', label: 'Reference No.', section: 'collapsed' },
];
// @sf-generated-end fields:paymentOut

// @sf-generated-start component:PaymentOutForm
export default function PaymentOutForm(props) {
  // @sf-custom-slot hooks:PaymentOutForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PaymentOutForm

// @sf-custom-slot section:PaymentOutForm-custom
