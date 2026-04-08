import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:goodsShipmentLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity' },
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'number', label: 'Order Quantity' },
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
