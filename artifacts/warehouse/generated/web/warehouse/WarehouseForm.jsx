import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:warehouse
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'principal' },
  { key: 'location', column: 'C_Location_ID', type: 'search', required: true, section: 'principal', reference: 'Location', inputMode: 'search' },
  { key: 'returnLocator', column: 'M_Returnlocator_ID', type: 'search', section: 'other', reference: 'Locator', inputMode: 'search' },
  { key: 'warehouseRule', column: 'M_Warehouse_Rule_ID', type: 'selector', section: 'other', reference: 'WarehouseRule', inputMode: 'selector' },
  { key: 'allocated', column: 'Isallocated', type: 'checkbox', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:warehouse

// @sf-generated-start component:WarehouseForm
export default function WarehouseForm(props) {
  // @sf-custom-slot hooks:WarehouseForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:WarehouseForm

// @sf-custom-slot section:WarehouseForm-custom
