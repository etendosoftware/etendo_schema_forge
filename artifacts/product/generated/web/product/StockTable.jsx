import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:stock
const columns = [
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string', label: 'Storage Bin' },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'string', label: 'Attribute Set Value' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number', label: 'Quantity on Hand' },
  { key: 'reservedQty', column: 'ReservedQty', type: 'number', label: 'Reserved Qty' },
  { key: 'allocatedQuantity', column: 'AllocatedQty', type: 'number', label: 'Allocated Quantity' },
];
// @sf-generated-end columns:stock

const filters = [];

// @sf-generated-start component:StockTable
export default function StockTable(props) {
  // @sf-custom-slot hooks:StockTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:StockTable

// @sf-custom-slot section:StockTable-custom
