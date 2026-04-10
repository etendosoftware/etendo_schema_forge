import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:movementLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string', label: 'Storage Bin' },
  { key: 'newStorageBin', column: 'M_LocatorTo_ID', type: 'string', label: 'New Storage Bin' },
];
// @sf-generated-end columns:movementLine

const filters = ['product'];

// @sf-generated-start component:MovementLineTable
export default function MovementLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:MovementLineTable
