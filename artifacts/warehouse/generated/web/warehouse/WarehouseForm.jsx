import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:warehouse
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'locationAddress', column: 'C_Location_ID', type: 'search', label: 'Location / Address', required: true, section: 'principal', reference: 'Location', inputMode: 'search', span: 2 },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', span: 4, rows: 1 },
];
// @sf-generated-end fields:warehouse

// @sf-generated-start component:WarehouseForm
export default function WarehouseForm(props) {
  return <EntityForm fields={fields} cols={4} {...props} />;
}

// @sf-generated-end component:WarehouseForm
