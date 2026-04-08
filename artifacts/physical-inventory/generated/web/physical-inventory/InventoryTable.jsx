import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:inventory
const columns = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date' },
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string', label: 'Warehouse' },
  { key: 'inventoryType', column: 'Inventory_Type', type: 'enum', label: 'Inventory Type', enumLabels: { 'C': 'Closing Inventory', 'N': 'Normal', 'O': 'Opening Inventory' } },
];
// @sf-generated-end columns:inventory

const filters = ['movementDate', 'warehouse', 'inventoryType'];

// @sf-generated-start component:InventoryTable
export default function InventoryTable(props) {
  // @sf-custom-slot hooks:InventoryTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:InventoryTable

// @sf-custom-slot section:InventoryTable-custom
