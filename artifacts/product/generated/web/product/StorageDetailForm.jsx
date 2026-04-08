import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:storageDetail
const fields = [
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'StorageBin', inputMode: 'selector' },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', readOnly: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'reservedQty', column: 'ReservedQty', type: 'text', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'allocatedQuantity', column: 'AllocatedQty', type: 'text', required: true, readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:storageDetail

// @sf-generated-start component:StorageDetailForm
export default function StorageDetailForm(props) {
  // @sf-custom-slot hooks:StorageDetailForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:StorageDetailForm

// @sf-custom-slot section:StorageDetailForm-custom
