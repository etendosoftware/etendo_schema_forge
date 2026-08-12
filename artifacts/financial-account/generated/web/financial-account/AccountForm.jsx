import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:account
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', readOnlyLogic: (record) => Number(record['hasTransaction']) > 0 },
  { key: 'type', column: 'Type', type: 'select', label: 'Type', required: true, section: 'principal', options: [{ value: 'B', label: 'Bank', labels: {"es_ES":"Banco"} }, { value: 'CA', label: 'Card', labels: {"es_ES":"Card"} }, { value: 'C', label: 'Cash', labels: {"es_ES":"Caja"} }], defaultValue: 'B' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', section: 'other', defaultValue: 'Y' },
  { key: 'default', column: 'Isdefault', type: 'checkbox', label: 'Default', required: true, readOnly: true, section: 'other' },
  { key: 'currentBalance', column: 'Currentbalance', type: 'number', label: 'Current Balance', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'aprmGlitemDiff', column: 'EM_Aprm_Glitem_Diff', type: 'selector', label: 'GL Item Difference', section: 'other', reference: 'Glitem', inputMode: 'selector' },
  { key: 'iBAN', column: 'Iban', type: 'text', label: 'IBAN', section: 'other' },
  { key: 'swiftCode', column: 'Swiftcode', type: 'text', label: 'SWIFT Code', section: 'other' },
  { key: 'writeofflimit', column: 'Writeofflimit', type: 'number', label: 'Write-off Limit', section: 'other' },
  { key: 'bankCode', column: 'Codebank', type: 'text', label: 'Bank Code', section: 'other' },
  { key: 'branchCode', column: 'Codebranch', type: 'text', label: 'Branch Code', section: 'other' },
  { key: 'partialAccountNo', column: 'Codeaccount', type: 'text', label: 'Partial Account No.', section: 'other' },
  { key: 'accountNo', column: 'Accountno', type: 'text', label: 'Displayed Account', section: 'other' },
  { key: 'psd2Provider', column: 'EM_Psd2_Provider_ID', type: 'search', label: 'Bank Provider', section: 'other', reference: 'PSD2_Provider', inputMode: 'search', readOnlyLogic: (record) => record['pSD2ConnectionStatus'] === 'CO' },
  { key: 'pSD2ImportFromDate', column: 'EM_PSD2_Import_From_Date', type: 'date', label: 'Import From Date', section: 'other' },
  { key: 'pSD2ImportToDate', column: 'EM_PSD2_Import_To_Date', type: 'date', label: 'Import To Date', section: 'other' },
  { key: 'pSD2StatementFrequency', column: 'EM_PSD2_Statement_Frequency', type: 'select', label: 'Statement Grouping', section: 'other', options: [{ value: '1BE', label: 'New statement each run', labels: {"es_ES":"One per run"} }, { value: '1BD', label: 'Within 1 day', labels: {"es_ES":"One per day"} }, { value: '1BW', label: 'Within 7 days', labels: {"es_ES":"One per week"} }, { value: '1BM', label: 'Within 30 days', labels: {"es_ES":"One per month"} }], defaultValue: '1BD' },
  { key: 'pSD2SaltEdgeAccountID', column: 'EM_PSD2_Salt_Edge_Account_ID', type: 'text', label: 'Salt Edge Account ID', readOnly: true, section: 'other' },
  { key: 'pSD2CardNumber', column: 'EM_PSD2_Masked_Pan', type: 'text', label: 'Card Number', readOnly: true, section: 'other' },
  { key: 'pSD2ConnectionStatus', column: 'EM_PSD2_Connection_Status', type: 'select', label: 'Bank Connection Status', readOnly: true, section: 'other', options: [{ value: 'CO', label: 'Active', labels: {"es_ES":"Active"} }, { value: 'DC', label: 'Inactive', labels: {"es_ES":"Inactive"} }], defaultValue: 'DC' },
  { key: 'eTGOAmountTolerance', column: 'EM_ETGO_Amount_Tolerance', type: 'number', label: 'EM_ETGO_Amount Tolerance', section: 'other', defaultValue: '0' },
  { key: 'eTGODateTolerance', column: 'EM_ETGO_Date_Tolerance', type: 'number', label: 'Date Tolerance', section: 'other', defaultValue: '3' },
];
// @sf-generated-end fields:account

// @sf-generated-start component:AccountForm
export default function AccountForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AccountForm
