import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:stock
const fields = [
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', required: true, readOnly: true, section: 'other', reference: 'StorageBin', inputMode: 'selector' },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', label: 'Attribute Set Value', readOnly: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number', label: 'Quantity on Hand', required: true, readOnly: true, section: 'other' },
  { key: 'reservedQty', column: 'ReservedQty', type: 'number', label: 'Reserved Qty', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'allocatedQuantity', column: 'AllocatedQty', type: 'number', label: 'Allocated Quantity', required: true, readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:stock

// @sf-generated-start component:StockForm
export default function StockForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:StockForm
