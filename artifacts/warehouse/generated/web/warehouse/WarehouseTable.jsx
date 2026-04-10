import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:warehouse
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string', label: 'Search Key' },
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
];
// @sf-generated-end columns:warehouse

const filters = ['searchKey', 'name'];

// @sf-generated-start component:WarehouseTable
export default function WarehouseTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:WarehouseTable
