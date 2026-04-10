import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:warehouse
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'locationAddress', column: 'C_Location_ID', type: 'search', label: 'Location / Address', required: true, section: 'principal', reference: 'Location', inputMode: 'search' },
  { key: 'warehouseRule', column: 'M_Warehouse_Rule_ID', type: 'selector', label: 'Warehouse Rule', section: 'other', reference: 'Warehouse_Rule', inputMode: 'selector' },
  { key: 'allocated', column: 'Isallocated', type: 'checkbox', label: 'Allocated', required: true, section: 'other', defaultValue: 'N', visible: null, visibilitySource: 'server', displayLogicReason: 'session-variable' },
];
// @sf-generated-end fields:warehouse

// @sf-generated-start component:WarehouseForm
export default function WarehouseForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:WarehouseForm
