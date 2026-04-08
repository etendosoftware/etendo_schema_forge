import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:returnMaterialReceiptLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SL_InOutLine_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', readOnly: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'text', required: true, readOnly: true, section: 'principal' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'search', required: true, readOnly: true, section: 'principal', reference: 'UOM', inputMode: 'search' },
  { key: 'salesOrderLine', column: 'C_OrderLine_ID', type: 'search', readOnly: true, section: 'other', reference: 'OrderLine', inputMode: 'search' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  // @sf-custom-slot callout:SL_InOut_Conversion
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'text', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:returnMaterialReceiptLine

// @sf-generated-start component:ReturnMaterialReceiptLineForm
export default function ReturnMaterialReceiptLineForm(props) {
  // @sf-custom-slot hooks:ReturnMaterialReceiptLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ReturnMaterialReceiptLineForm

// @sf-custom-slot section:ReturnMaterialReceiptLineForm-custom
