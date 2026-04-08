import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:inventoryLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_InventoryLine WHERE M_Inventory_ID=@M_Inventory_ID@' },
  // @sf-custom-slot callout:SL_Inventory_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  // @sf-custom-slot callout:SL_Inventory_Locator
  { key: 'storageBin', column: 'M_Locator_ID', type: 'search', label: 'Storage Bin', required: true, section: 'principal', reference: 'Locator', inputMode: 'search', defaultValue: '@SQL=SELECT M_LOCATOR_ID AS DEFAULTVALUE FROM M_LOCATOR WHERE AD_ISORGINCLUDED(@AD_Org_ID@, M_LOCATOR.AD_Org_ID, @#AD_Client_ID@) <> -1 AND ISACTIVE=\'Y\' AND M_WAREHOUSE_ID=@M_WAREHOUSE_ID@  ORDER BY M_LOCATOR.ISDEFAULT DESC' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'quantityOrderBook', column: 'QuantityOrderBook', type: 'number', label: 'Quantity order book', readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'quantityCount', column: 'QtyCount', type: 'number', label: 'User Count', required: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'bookQuantity', column: 'QtyBook', type: 'number', label: 'System Count', required: true, readOnly: true, section: 'other' },
  { key: 'cost', column: 'Cost', type: 'number', label: 'Cost', section: 'other' },
];
// @sf-generated-end fields:inventoryLine

// @sf-generated-start component:InventoryLineForm
export default function InventoryLineForm(props) {
  // @sf-custom-slot hooks:InventoryLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:InventoryLineForm

// @sf-custom-slot section:InventoryLineForm-custom
