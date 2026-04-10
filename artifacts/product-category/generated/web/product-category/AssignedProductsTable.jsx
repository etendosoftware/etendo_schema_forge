import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:assignedProducts
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string', label: 'Search Key' },
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'productType', column: 'ProductType', type: 'enum', label: 'Product Type', enumLabels: { 'E': 'Expense type', 'I': 'Item', 'R': 'Resource', 'S': 'Service' } },
];
// @sf-generated-end columns:assignedProducts

const filters = ['searchKey', 'name', 'productType'];

// @sf-generated-start component:AssignedProductsTable
export default function AssignedProductsTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:AssignedProductsTable
