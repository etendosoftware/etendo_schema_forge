import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bankAccount
const columns = [
  { key: 'bankName', column: 'Bank_Name', type: 'string', label: 'Bank Name' },
  { key: 'bankFormat', column: 'BankFormat', type: 'enum', label: 'Bank Account Format', enumLabels: { 'GENERIC': 'Use Generic Account No.', 'IBAN': 'Use IBAN', 'SWIFT': 'Use SWIFT + Generic Account No.', 'SPANISH': 'Use Spanish' } },
  { key: 'accountNo', column: 'AccountNo', type: 'string', label: 'Generic Account No.' },
  { key: 'iBAN', column: 'Iban', type: 'string', label: 'IBAN' },
];
// @sf-generated-end columns:bankAccount

const filters = [];

// @sf-generated-start component:BankAccountTable
export default function BankAccountTable(props) {
  // @sf-custom-slot hooks:BankAccountTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BankAccountTable

// @sf-custom-slot section:BankAccountTable-custom
