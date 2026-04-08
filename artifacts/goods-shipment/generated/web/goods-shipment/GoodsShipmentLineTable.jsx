import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:goodsShipmentLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number' },
];
// @sf-generated-end columns:goodsShipmentLine

const filters = ['product'];

// @sf-generated-start component:GoodsShipmentLineTable
export default function GoodsShipmentLineTable(props) {
  // @sf-custom-slot hooks:GoodsShipmentLineTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:GoodsShipmentLineTable

// @sf-custom-slot section:GoodsShipmentLineTable-custom
