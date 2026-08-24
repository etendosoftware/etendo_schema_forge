import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:costCenter
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', span: 2, rows: 1 },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal', defaultValue: 'Y' },
];
// @sf-generated-end fields:costCenter

// @sf-generated-start component:CostCenterForm
export default function CostCenterForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:CostCenterForm
