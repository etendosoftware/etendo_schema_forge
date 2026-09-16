import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:serviceProject
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal', maxLength: 40 },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', maxLength: 60 },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', maxLength: 255, span: 2, rows: 1 },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, section: 'principal', defaultValue: 'Y' },
];
// @sf-generated-end fields:serviceProject

// @sf-generated-start component:ServiceProjectForm
export default function ServiceProjectForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
ServiceProjectForm.fields = fields;

// @sf-generated-end component:ServiceProjectForm
