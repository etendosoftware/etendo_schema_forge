import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:inventoryLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'quantityCount', column: 'QtyCount', type: 'number', label: 'User Count' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
  { key: 'bookQuantity', column: 'QtyBook', type: 'number', label: 'System Count' },
];
// @sf-generated-end columns:inventoryLine

const filters = [];

// @sf-generated-start component:InventoryLineTable
export default function InventoryLineTable(props) {
  // @sf-custom-slot hooks:InventoryLineTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:InventoryLineTable

// @sf-custom-slot section:InventoryLineTable-custom
