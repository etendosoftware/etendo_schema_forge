import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:binContents
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', label: 'Attribute Set Value', readOnly: true, section: 'other' },
  { key: 'lastInventoryCountDate', column: 'DateLastInventory', type: 'date', label: 'Last Inventory Count Date', readOnly: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true, section: 'principal', reference: 'UOM', inputMode: 'selector' },
  { key: 'orderUOM', column: 'M_Product_Uom_Id', type: 'selector', label: 'Order UOM', section: 'principal', reference: 'Product_Uom', inputMode: 'selector' },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number', label: 'Quantity on Hand', required: true, readOnly: true, section: 'other' },
  { key: 'onHandOrderQuanity', column: 'QtyOrderOnHand', type: 'number', label: 'On Hand Order Quantity', section: 'principal' },
  { key: 'quantityInDraftTransactions', column: 'PreQtyOnHand', type: 'number', label: 'Quantity in draft transactions', readOnly: true, section: 'other' },
  { key: 'quantityOrderInDraftTransactions', column: 'PreQtyOrderOnHand', type: 'number', label: 'Quantity Order in draft transactions', readOnly: true, section: 'other' },
  { key: 'referencedInventory', column: 'M_RefInventory_ID', type: 'selector', label: 'Referenced Inventory', readOnly: true, section: 'other', reference: 'RefInventory', inputMode: 'selector' },
];
// @sf-generated-end fields:binContents

// @sf-generated-start component:BinContentsForm
export default function BinContentsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BinContentsForm
