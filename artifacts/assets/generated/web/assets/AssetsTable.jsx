import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:assets
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'assetCategory', column: 'A_Asset_Group_ID', type: 'string', label: 'Asset Category' },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'purchaseDate', column: 'Datepurchased', type: 'date', label: 'Purchase Date' },
  { key: 'depreciationStartDate', column: 'Amortizationstartdate', type: 'date', label: 'Depreciation Start Date' },
  { key: 'assetValue', column: 'AssetValueAmt', type: 'amount', label: 'Asset Value', summable: true },
  { key: 'depreciatedValue', column: 'Depreciatedvalue', type: 'amount', label: 'Depreciated Value', summable: true },
  { key: 'fullyDepreciated', column: 'IsFullyDepreciated', type: 'boolean', label: 'Fully Depreciated', badge: true },
];
// @sf-generated-end columns:assets

const filters = ['searchKey', 'name', 'assetCategory', 'depreciate', 'fullyDepreciated'];

// @sf-generated-start component:AssetsTable
export default function AssetsTable(props) {
  // @sf-custom-slot hooks:AssetsTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:AssetsTable

// @sf-custom-slot section:AssetsTable-custom
