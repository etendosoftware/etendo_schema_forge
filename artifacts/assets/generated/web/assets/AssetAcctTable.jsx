import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:assetAcct
const columns = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'string', label: 'General Ledger' },
  { key: 'accumulatedDepreciation', column: 'A_Accumdepreciation_Acct', type: 'string', label: 'Accumulated Depreciation' },
  { key: 'depreciation', column: 'A_Depreciation_Acct', type: 'string', label: 'Depreciation' },
];
// @sf-generated-end columns:assetAcct

const filters = [];

// @sf-generated-start component:AssetAcctTable
export default function AssetAcctTable(props) {
  // @sf-custom-slot hooks:AssetAcctTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:AssetAcctTable

// @sf-custom-slot section:AssetAcctTable-custom
