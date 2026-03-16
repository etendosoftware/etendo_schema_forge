import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:warehouse
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string' },
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'description', column: 'Description', type: 'string' },
  { key: 'location', column: 'C_Location_ID', type: 'string' },
];
// @sf-generated-end columns:warehouse

const filters = ['searchKey', 'name'];

// @sf-generated-start component:WarehouseTable
export default function WarehouseTable(props) {
  // @sf-custom-slot hooks:WarehouseTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:WarehouseTable

// @sf-custom-slot section:WarehouseTable-custom
