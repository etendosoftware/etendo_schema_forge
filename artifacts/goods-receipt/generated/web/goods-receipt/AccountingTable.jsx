import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:accounting
const columns = [
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date' },
  { key: 'account', column: 'Account_ID', type: 'string', label: 'Account' },
  { key: 'debit', column: 'AmtAcctDr', type: 'amount', label: 'Debit' },
  { key: 'credit', column: 'AmtAcctCr', type: 'amount', label: 'Credit' },
];
// @sf-generated-end columns:accounting

const filters = [];

// @sf-generated-start component:AccountingTable
export default function AccountingTable(props) {
  // @sf-custom-slot hooks:AccountingTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:AccountingTable

// @sf-custom-slot section:AccountingTable-custom
