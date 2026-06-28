import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:inventory
const fields = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', label: 'Warehouse', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
  { key: 'inventoryType', column: 'Inventory_Type', type: 'select', label: 'Inventory Type', required: true, readOnly: true, section: 'other', options: [{ value: 'C', label: 'Closing Inventory' }, { value: 'N', label: 'Normal' }, { value: 'O', label: 'Opening Inventory' }], defaultValue: 'N' },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'other', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
];
// @sf-generated-end fields:inventory

// @sf-generated-start component:InventoryForm
export default function InventoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:InventoryForm
