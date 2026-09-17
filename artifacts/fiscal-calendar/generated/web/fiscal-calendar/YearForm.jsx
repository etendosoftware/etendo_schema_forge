import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:year
const fields = [
  { key: 'fiscalYear', column: 'Year', type: 'text', label: 'Fiscal Year', required: true, section: 'principal', maxLength: 10 },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', maxLength: 255 },
];
// @sf-generated-end fields:year

// @sf-generated-start component:YearForm
export default function YearForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
YearForm.fields = fields;

// @sf-generated-end component:YearForm
