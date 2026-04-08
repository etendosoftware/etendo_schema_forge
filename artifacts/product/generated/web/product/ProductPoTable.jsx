import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productPo
const columns = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'currentVendor', column: 'IsCurrentVendor', type: 'boolean' },
  { key: 'listPrice', column: 'PriceList', type: 'string' },
  { key: 'purchaseOrderPrice', column: 'PricePO', type: 'string' },
  { key: 'lastPurchasePrice', column: 'PriceLastPO', type: 'string' },
];
// @sf-generated-end columns:productPo

const filters = [];

// @sf-generated-start component:ProductPoTable
export default function ProductPoTable(props) {
  // @sf-custom-slot hooks:ProductPoTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductPoTable

// @sf-custom-slot section:ProductPoTable-custom
