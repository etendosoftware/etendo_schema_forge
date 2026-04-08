import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productPrice
const columns = [
  { key: 'priceListVersion', column: 'M_PriceList_Version_ID', type: 'string' },
  { key: 'standardPrice', column: 'PriceStd', type: 'string' },
  { key: 'listPrice', column: 'PriceList', type: 'string' },
];
// @sf-generated-end columns:productPrice

const filters = [];

// @sf-generated-start component:ProductPriceTable
export default function ProductPriceTable(props) {
  // @sf-custom-slot hooks:ProductPriceTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductPriceTable

// @sf-custom-slot section:ProductPriceTable-custom
