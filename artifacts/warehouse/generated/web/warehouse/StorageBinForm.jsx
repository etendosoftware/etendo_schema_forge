import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:storageBin
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'rowX', column: 'X', type: 'text', label: 'Row (X)', required: true, section: 'principal' },
  { key: 'stackY', column: 'Y', type: 'text', label: 'Stack (Y)', required: true, section: 'principal' },
  { key: 'levelZ', column: 'Z', type: 'text', label: 'Level (Z)', required: true, section: 'principal' },
  { key: 'relativePriority', column: 'PriorityNo', type: 'number', label: 'Relative Priority', required: true, section: 'other', defaultValue: '50' },
  { key: 'barcode', column: 'Barcode', type: 'text', label: 'Barcode', section: 'other' },
  { key: 'inventoryStatus', column: 'M_InventoryStatus_ID', type: 'selector', label: 'Inventory Status', required: true, readOnly: true, section: 'other', reference: 'InventoryStatus', inputMode: 'selector', defaultValue: '7B3DC15A20234C418D26EECDC5D59003' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', required: true, section: 'other' },
];
// @sf-generated-end fields:storageBin

// @sf-generated-start component:StorageBinForm
export default function StorageBinForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:StorageBinForm
