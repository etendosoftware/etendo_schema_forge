import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:inventory
const fields = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', label: 'Warehouse', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search', readOnlyLogic: (record) => !!record.hasLines },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'principal', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'costCenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', section: 'principal', reference: 'Costcenter', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['posted'] === true },
];
// @sf-generated-end fields:inventory

// @sf-generated-start component:InventoryForm
export default function InventoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
InventoryForm.fields = fields;

// @sf-generated-end component:InventoryForm
