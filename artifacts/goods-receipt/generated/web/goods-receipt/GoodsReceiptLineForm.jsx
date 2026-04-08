import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:goodsReceiptLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, section: 'principal' },
  // @sf-custom-slot callout:SL_InOutLine_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', section: 'principal' },
  // @sf-custom-slot callout:OperativeQuantity_To_BaseQuantity
  { key: 'operativeQuantity', column: 'Aumqty', type: 'text', section: 'principal' },
  // @sf-custom-slot callout:OperativeQuantity_To_BaseQuantity
  { key: 'operativeUOM', column: 'C_Aum', type: 'selector', section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'text', required: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', section: 'other', reference: 'Locator', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  { key: 'salesOrderLine', column: 'C_OrderLine_ID', type: 'search', readOnly: true, section: 'other', reference: 'OrderLine', inputMode: 'search' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', section: 'other', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'project', column: 'C_Project_ID', type: 'search', section: 'other', reference: 'Project', inputMode: 'search' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', section: 'other', reference: 'CostCenter', inputMode: 'selector' },
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', section: 'other', reference: 'Asset', inputMode: 'selector' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', section: 'other', reference: 'UserDimension1', inputMode: 'selector' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', section: 'other', reference: 'UserDimension2', inputMode: 'selector' },
  { key: 'invoiceQuantity', column: 'Qtyinvoiced', type: 'text', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:goodsReceiptLine

// @sf-generated-start component:GoodsReceiptLineForm
export default function GoodsReceiptLineForm(props) {
  // @sf-custom-slot hooks:GoodsReceiptLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:GoodsReceiptLineForm

// @sf-custom-slot section:GoodsReceiptLineForm-custom
