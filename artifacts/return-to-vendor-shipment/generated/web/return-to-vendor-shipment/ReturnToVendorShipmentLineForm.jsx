import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:returnToVendorShipmentLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, readOnly: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_InOutLine WHERE M_InOut_ID=@M_InOut_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', readOnly: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, section: 'principal', defaultValue: '0', readOnlyLogic: (record) => record['processed'] === true || record['uomManagement'] === 'Y' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'search', label: 'UOM', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'search', readOnlyLogic: (record) => record['uomManagement'] === 'Y' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'number', label: 'Order Quantity', readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
];
// @sf-generated-end fields:returnToVendorShipmentLine

// @sf-generated-start component:ReturnToVendorShipmentLineForm
export default function ReturnToVendorShipmentLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ReturnToVendorShipmentLineForm
