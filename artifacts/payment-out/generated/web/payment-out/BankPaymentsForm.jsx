import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bankPayments
const fields = [
  { key: 'status', column: 'Status', type: 'select', label: 'Status', required: true, section: 'principal', options: [{ value: 'authorized', label: 'AUTHORIZED', labels: {"es_ES":"AUTHORIZED"} }, { value: 'authorizing', label: 'AUTHORIZING', labels: {"es_ES":"AUTHORIZING"} }, { value: 'executed', label: 'EXECUTED', labels: {"es_ES":"EXECUTED"} }, { value: 'failed', label: 'FAILED', labels: {"es_ES":"FAILED"} }, { value: 'initiated', label: 'INITIATED', labels: {"es_ES":"INITIATED"} }, { value: 'initiated_info_required', label: 'INITIATED INFO REQUIRED', labels: {"es_ES":"INITIATED INFO REQUIRED"} }, { value: 'requested', label: 'REQUESTED', labels: {"es_ES":"REQUESTED"} }, { value: 'settled', label: 'SETTLED', labels: {"es_ES":"SETTLED"} }], defaultValue: 'requested' },
  { key: 'saltedgeProviderCode', column: 'Saltedge_Provider_Code', type: 'text', label: 'Saltedge Provider Code', section: 'principal', maxLength: 255 },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Amount', required: true, section: 'principal', defaultValue: '0' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector' },
  { key: 'creditorName', column: 'Creditor_Name', type: 'text', label: 'Creditor Name', section: 'other', maxLength: 255 },
  { key: 'creditorIban', column: 'Creditor_Iban', type: 'text', label: 'Creditor Iban', section: 'other', maxLength: 34 },
  { key: 'debtorName', column: 'Debtor_Name', type: 'text', label: 'Debtor Name', section: 'other', maxLength: 255 },
  { key: 'debtorIban', column: 'Debtor_Iban', type: 'text', label: 'Debtor Iban', section: 'other', maxLength: 34 },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other', maxLength: 2000 },
  { key: 'financialAccount', column: 'FIN_Financial_Account_ID', type: 'selector', label: 'Financial Account', required: true, section: 'other', reference: 'Financial_Account', inputMode: 'selector' },
];
// @sf-generated-end fields:bankPayments

// @sf-generated-start component:BankPaymentsForm
export default function BankPaymentsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
BankPaymentsForm.fields = fields;

// @sf-generated-end component:BankPaymentsForm
