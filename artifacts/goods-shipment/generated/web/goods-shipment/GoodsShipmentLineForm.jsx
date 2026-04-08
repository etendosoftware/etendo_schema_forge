import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:goodsShipmentLine
const fields = [
  // @sf-custom-slot callout:SL_InOutLine_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, section: 'principal', defaultValue: '0' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
];
// @sf-generated-end fields:goodsShipmentLine

// @sf-generated-start component:GoodsShipmentLineForm
export default function GoodsShipmentLineForm(props) {
  // @sf-custom-slot hooks:GoodsShipmentLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:GoodsShipmentLineForm

// @sf-custom-slot section:GoodsShipmentLineForm-custom
