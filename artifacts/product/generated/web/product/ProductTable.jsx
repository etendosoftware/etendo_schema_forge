import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:product
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string' },
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'productCategory', column: 'M_Product_Category_ID', type: 'string' },
  { key: 'purchase', column: 'IsPurchased', type: 'boolean' },
  { key: 'sale', column: 'IsSold', type: 'boolean' },
  { key: 'productType', column: 'ProductType', type: 'string' },
];
// @sf-generated-end columns:product

const filters = ['searchKey', 'name', 'productCategory', 'productType', 'uPCEAN'];

// @sf-generated-start component:ProductTable
export default function ProductTable(props) {
  // @sf-custom-slot hooks:ProductTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductTable

// @sf-custom-slot section:ProductTable-custom
