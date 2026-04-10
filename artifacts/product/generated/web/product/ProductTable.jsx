import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:product
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string', label: 'Search Key' },
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
  { key: 'productCategory', column: 'M_Product_Category_ID', type: 'string', label: 'Product Category' },
  { key: 'productType', column: 'ProductType', type: 'enum', label: 'Product Type', enumLabels: { 'E': 'Expense type', 'I': 'Item', 'R': 'Resource', 'S': 'Service' } },
];
// @sf-generated-end columns:product

const filters = ['searchKey', 'name', 'productCategory', 'productType', 'uPCEAN'];

// @sf-generated-start component:ProductTable
export default function ProductTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductTable
