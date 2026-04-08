import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpBankAccount
const fields = [
  { key: 'bankName', column: 'Bank_Name', type: 'text', label: 'Bank Name', section: 'principal' },
  { key: 'country', column: 'C_Country_ID', type: 'selector', label: 'Country', section: 'principal', reference: 'Country', inputMode: 'selector', defaultValue: '@COUNTRYDEF@' },
  { key: 'userContact', column: 'AD_User_ID', type: 'selector', label: 'User/Contact', section: 'principal', reference: 'User', inputMode: 'selector' },
  { key: 'bankFormat', column: 'BankFormat', type: 'select', label: 'Bank Account Format', required: true, section: 'principal', options: [{ value: 'GENERIC', label: 'Use Generic Account No.' }, { value: 'IBAN', label: 'Use IBAN' }, { value: 'SWIFT', label: 'Use SWIFT + Generic Account No.' }, { value: 'SPANISH', label: 'Use Spanish' }], defaultValue: 'GENERIC' },
  { key: 'accountNo', column: 'AccountNo', type: 'text', label: 'Generic Account No.', section: 'principal' },
  { key: 'iBAN', column: 'Iban', type: 'text', label: 'IBAN', section: 'principal' },
  { key: 'swiftCode', column: 'SwiftCode', type: 'text', label: 'SWIFT Code', section: 'principal' },
  { key: 'displayedAccount', column: 'Displayedaccount', type: 'text', label: 'Displayed Account', readOnly: true, section: 'principal' },
];
// @sf-generated-end fields:bpBankAccount

// @sf-generated-start component:BpBankAccountForm
export default function BpBankAccountForm(props) {
  // @sf-custom-slot hooks:BpBankAccountForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BpBankAccountForm

// @sf-custom-slot section:BpBankAccountForm-custom
