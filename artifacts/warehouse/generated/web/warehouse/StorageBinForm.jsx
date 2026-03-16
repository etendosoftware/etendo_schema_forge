import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:storageBin
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', required: true, section: 'principal' },
  { key: 'row', column: 'X', type: 'text', required: true, section: 'principal' },
  { key: 'stack', column: 'Y', type: 'text', required: true, section: 'principal' },
  { key: 'level', column: 'Z', type: 'text', required: true, section: 'principal' },
  { key: 'priority', column: 'PriorityNo', type: 'number', required: true, section: 'other' },
  { key: 'barcode', column: 'Barcode', type: 'text', section: 'other' },
  { key: 'inventoryStatus', column: 'M_InventoryStatus_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'InventoryStatus', inputMode: 'selector' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', required: true, section: 'other' },
  { key: 'changeStatus', column: 'Change_Status', type: 'text', required: true, section: 'other' },
];
// @sf-generated-end fields:storageBin

// @sf-generated-start component:StorageBinForm
export default function StorageBinForm(props) {
  // @sf-custom-slot hooks:StorageBinForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:StorageBinForm

// @sf-custom-slot section:StorageBinForm-custom
