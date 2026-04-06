import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:inventory
const fields = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', defaultValue: '@#Date@' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', defaultValue: '@#Date@' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', label: 'Warehouse', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
  { key: 'inventoryType', column: 'Inventory_Type', type: 'select', label: 'Inventory Type', required: true, readOnly: true, section: 'other', options: [{ value: 'C', label: 'Closing Inventory' }, { value: 'N', label: 'Normal' }, { value: 'O', label: 'Opening Inventory' }], defaultValue: 'N' },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'other', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === 'Y' },
];
// @sf-generated-end fields:inventory

// @sf-generated-start component:InventoryForm
export default function InventoryForm(props) {
  // @sf-custom-slot hooks:InventoryForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:InventoryForm

// @sf-custom-slot section:InventoryForm-custom
