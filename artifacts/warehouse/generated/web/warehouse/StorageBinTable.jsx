import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:storageBin
const columns = [
  { key: 'searchKey', column: 'Value', type: 'string' },
  { key: 'row', column: 'X', type: 'string' },
  { key: 'stack', column: 'Y', type: 'string' },
  { key: 'level', column: 'Z', type: 'string' },
  { key: 'priority', column: 'PriorityNo', type: 'number' },
  { key: 'inventoryStatus', column: 'M_InventoryStatus_ID', type: 'string' },
  { key: 'default', column: 'IsDefault', type: 'boolean' },
];
// @sf-generated-end columns:storageBin

const filters = ['searchKey', 'barcode'];

// @sf-generated-start component:StorageBinTable
export default function StorageBinTable(props) {
  // @sf-custom-slot hooks:StorageBinTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:StorageBinTable

// @sf-custom-slot section:StorageBinTable-custom
