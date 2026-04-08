import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpBankAccount
const columns = [
  { key: 'bankName', column: 'Bank_Name', type: 'string', label: 'Bank Name' },
  { key: 'bankFormat', column: 'BankFormat', type: 'enum', label: 'Bank Account Format', enumLabels: { 'GENERIC': 'Use Generic Account No.', 'IBAN': 'Use IBAN', 'SWIFT': 'Use SWIFT + Generic Account No.', 'SPANISH': 'Use Spanish' } },
  { key: 'accountNo', column: 'AccountNo', type: 'string', label: 'Generic Account No.' },
  { key: 'iBAN', column: 'Iban', type: 'string', label: 'IBAN' },
];
// @sf-generated-end columns:bpBankAccount

const filters = [];

// @sf-generated-start component:BpBankAccountTable
export default function BpBankAccountTable(props) {
  // @sf-custom-slot hooks:BpBankAccountTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpBankAccountTable

// @sf-custom-slot section:BpBankAccountTable-custom
