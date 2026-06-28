import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:account
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', readOnlyLogic: (record) => Number(record['hasTransaction']) > 0 },
  { key: 'type', column: 'Type', type: 'select', label: 'Type', required: true, section: 'principal', options: [{ value: 'B', label: 'Bank' }, { value: 'CA', label: 'Card' }, { value: 'C', label: 'Cash' }], defaultValue: 'B' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', section: 'other', defaultValue: 'Y' },
  { key: 'currentBalance', column: 'Currentbalance', type: 'number', label: 'Current Balance', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'iBAN', column: 'Iban', type: 'text', label: 'IBAN', section: 'other' },
  { key: 'swiftCode', column: 'Swiftcode', type: 'text', label: 'SWIFT Code', section: 'other' },
  { key: 'bankCode', column: 'Codebank', type: 'text', label: 'Bank Code', section: 'other' },
  { key: 'branchCode', column: 'Codebranch', type: 'text', label: 'Branch Code', section: 'other' },
  { key: 'partialAccountNo', column: 'Codeaccount', type: 'text', label: 'Partial Account No.', section: 'other' },
  { key: 'accountNo', column: 'Accountno', type: 'text', label: 'Displayed Account', section: 'other' },
  { key: 'psd2Provider', column: 'EM_Psd2_Provider_ID', type: 'search', label: 'Bank Provider', section: 'other', reference: 'PSD2_Provider', inputMode: 'search', readOnlyLogic: (record) => record['pSD2ConnectionStatus'] === 'CO' },
  { key: 'pSD2ImportFromDate', column: 'EM_PSD2_Import_From_Date', type: 'date', label: 'Import From Date', section: 'other' },
  { key: 'pSD2ImportToDate', column: 'EM_PSD2_Import_To_Date', type: 'date', label: 'Import To Date', section: 'other' },
  { key: 'pSD2StatementFrequency', column: 'EM_PSD2_Statement_Frequency', type: 'select', label: 'Statement Grouping', section: 'other', options: [{ value: '1BE', label: 'New statement each run' }, { value: '1BD', label: 'Within 1 day' }, { value: '1BW', label: 'Within 7 days' }, { value: '1BM', label: 'Within 30 days' }], defaultValue: '1BD' },
  { key: 'pSD2SaltEdgeAccountID', column: 'EM_PSD2_Salt_Edge_Account_ID', type: 'text', label: 'Salt Edge Account ID', readOnly: true, section: 'other' },
  { key: 'pSD2CardNumber', column: 'EM_PSD2_Masked_Pan', type: 'text', label: 'Card Number', readOnly: true, section: 'other' },
  { key: 'pSD2ConnectionStatus', column: 'EM_PSD2_Connection_Status', type: 'select', label: 'Bank Connection Status', readOnly: true, section: 'other', options: [{ value: 'CO', label: 'Active' }, { value: 'DC', label: 'Inactive' }], defaultValue: 'DC' },
];
// @sf-generated-end fields:account

// @sf-generated-start component:AccountForm
export default function AccountForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AccountForm
