import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:goodsShipmentLine
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, lookup: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, section: 'principal', defaultValue: '0', readOnlyLogic: (record) => record['processed'] === true || record['uomManagement'] === 'Y' },
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'number', label: 'Order Quantity', readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'principal', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', section: 'principal', reference: 'Costcenter', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
];
// @sf-generated-end fields:goodsShipmentLine

// @sf-generated-start component:GoodsShipmentLineForm
export default function GoodsShipmentLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
GoodsShipmentLineForm.fields = fields;

// @sf-generated-end component:GoodsShipmentLineForm
