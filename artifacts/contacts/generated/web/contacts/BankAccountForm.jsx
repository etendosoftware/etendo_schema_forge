import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bankAccount
const fields = [
  { key: 'bankName', column: 'Bank_Name', type: 'text', label: 'Bank Name', section: 'principal', maxLength: 50 },
  { key: 'country', column: 'C_Country_ID', type: 'selector', label: 'Country', section: 'principal', reference: 'Country', inputMode: 'selector', defaultValue: '@COUNTRYDEF@' },
  { key: 'userContact', column: 'AD_User_ID', type: 'selector', label: 'User/Contact', section: 'principal', reference: 'User', inputMode: 'selector' },
  { key: 'bankFormat', column: 'BankFormat', type: 'select', labels: {"en_US":"Format","es_ES":"Formato"}, label: 'Bank Account Format', required: true, section: 'principal', options: [{ value: 'GENERIC', label: 'Use Generic Account No.', labels: {"es_ES":"Utilizar Número Genérico de Cuenta"} }, { value: 'IBAN', label: 'Use IBAN', labels: {"es_ES":"Utilizar IBAN"} }, { value: 'SWIFT', label: 'Use SWIFT + Generic Account No.', labels: {"es_ES":"Usar código SWIFT + Número Genérico de Cuenta"} }, { value: 'SPANISH', label: 'Use Spanish', labels: {"es_ES":"Utilizar Español"} }], defaultValue: 'GENERIC' },
  { key: 'accountNo', column: 'AccountNo', type: 'text', label: 'Generic Account No.', section: 'principal', maxLength: 100 },
  { key: 'iBAN', column: 'Iban', type: 'text', label: 'IBAN', section: 'principal', maxLength: 34 },
  { key: 'swiftCode', column: 'SwiftCode', type: 'text', label: 'SWIFT Code', section: 'principal', maxLength: 20 },
  { key: 'displayedAccount', column: 'Displayedaccount', type: 'text', label: 'Displayed Account', readOnly: true, section: 'principal', maxLength: 120 },
];
// @sf-generated-end fields:bankAccount

// @sf-generated-start component:BankAccountForm
export default function BankAccountForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
BankAccountForm.fields = fields;

// @sf-generated-end component:BankAccountForm
