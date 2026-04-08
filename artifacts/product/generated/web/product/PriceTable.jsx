import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:price
const columns = [
  { key: 'priceListVersion', column: 'M_PriceList_Version_ID', type: 'string', label: 'Price List Version' },
  { key: 'standardPrice', column: 'PriceStd', type: 'number', label: 'Unit Price' },
  { key: 'listPrice', column: 'PriceList', type: 'number', label: 'List Price' },
];
// @sf-generated-end columns:price

const filters = [];

// @sf-generated-start component:PriceTable
export default function PriceTable(props) {
  // @sf-custom-slot hooks:PriceTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PriceTable

// @sf-custom-slot section:PriceTable-custom
