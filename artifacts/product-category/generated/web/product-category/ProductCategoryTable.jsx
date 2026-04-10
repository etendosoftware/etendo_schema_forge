import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productCategory
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string', label: 'Search Key' },
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
];
// @sf-generated-end columns:productCategory

const filters = ['searchKey', 'name'];

// @sf-generated-start component:ProductCategoryTable
export default function ProductCategoryTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductCategoryTable
