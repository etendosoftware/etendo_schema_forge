import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentIn
const fields = [
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', label: 'Received From', section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date', required: true, section: 'principal' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Amount', required: true, section: 'principal' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'principal', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'selector', label: 'Paying From', required: true, section: 'principal', reference: 'FinancialAccount', inputMode: 'selector' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector' },
  { key: 'referenceNo', column: 'Referenceno', type: 'text', label: 'Reference No.', section: 'principal' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', readOnly: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'financialTransactionAmount', column: 'Finacc_Txn_Amount', type: 'number', label: 'Received (Financial Account)', readOnly: true, section: 'other' },
  { key: 'financialTransactionConvertRate', column: 'Finacc_Txn_Convert_Rate', type: 'text', label: 'Exchange Rate', readOnly: true, section: 'other' },
  { key: 'generatedCredit', column: 'Generated_Credit', type: 'number', label: 'Generated Credit', readOnly: true, section: 'other' },
  { key: 'usedCredit', column: 'Used_Credit', type: 'number', label: 'Used Credit', readOnly: true, section: 'other' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'number', label: 'Write-off Amount', readOnly: true, section: 'other' },
  { key: 'reversedPayment', column: 'FIN_Rev_Payment_ID', type: 'selector', label: 'Reversed Payment', readOnly: true, section: 'other', reference: 'Payment', inputMode: 'selector' },
  { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', section: 'other', reference: 'Project', inputMode: 'selector' },
];
// @sf-generated-end fields:paymentIn

// @sf-generated-start component:PaymentInForm
export default function PaymentInForm(props) {
  // @sf-custom-slot hooks:PaymentInForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PaymentInForm

// @sf-custom-slot section:PaymentInForm-custom
