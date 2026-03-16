import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:binContent
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'uom', column: 'C_UOM_ID', type: 'string' },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number' },
  { key: 'quantityOrderOnHand', column: 'QtyOrderOnHand', type: 'number' },
  { key: 'lastInventoryDate', column: 'DateLastInventory', type: 'date' },
];
// @sf-generated-end columns:binContent

const filters = ['product'];

// @sf-generated-start component:BinContentTable
export default function BinContentTable(props) {
  // @sf-custom-slot hooks:BinContentTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BinContentTable

// @sf-custom-slot section:BinContentTable-custom
