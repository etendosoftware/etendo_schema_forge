import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:year
const fields = [
  { key: 'fiscalYear', column: 'Year', type: 'text', label: 'Fiscal Year', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'calendar', column: 'C_Calendar_ID', type: 'selector', label: 'Calendar', required: true, lookup: true, section: 'principal', reference: 'Calendar', inputMode: 'selector' },
];
// @sf-generated-end fields:year

// @sf-generated-start component:YearForm
export default function YearForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:YearForm
