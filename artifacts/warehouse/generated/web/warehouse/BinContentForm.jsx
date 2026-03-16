import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:binContent
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Product', inputMode: 'search' },
  { key: 'attributeSetInstance', column: 'M_AttributeSetInstance_ID', type: 'text', readOnly: true, section: 'other' },
  { key: 'uom', column: 'C_UOM_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'productUom', column: 'M_Product_Uom_Id', type: 'selector', readOnly: true, section: 'other', reference: 'ProductUOM', inputMode: 'selector' },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'quantityOrderOnHand', column: 'QtyOrderOnHand', type: 'number', readOnly: true, section: 'other' },
  { key: 'preQuantityOnHand', column: 'PreQtyOnHand', type: 'number', readOnly: true, section: 'other' },
  { key: 'preQuantityOrderOnHand', column: 'PreQtyOrderOnHand', type: 'number', readOnly: true, section: 'other' },
  { key: 'lastInventoryDate', column: 'DateLastInventory', type: 'date', readOnly: true, section: 'other' },
  { key: 'referenceInventory', column: 'M_RefInventory_ID', type: 'selector', readOnly: true, section: 'other', reference: 'ReferenceInventory', inputMode: 'selector' },
];
// @sf-generated-end fields:binContent

// @sf-generated-start component:BinContentForm
export default function BinContentForm(props) {
  // @sf-custom-slot hooks:BinContentForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BinContentForm

// @sf-custom-slot section:BinContentForm-custom
