import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:organization
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'socialName', column: 'Social_Name', type: 'text', label: 'Legal Name', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'etgoBusinessType', column: 'EM_Etgo_Business_Type', type: 'select', label: 'Business Type', required: true, section: 'principal', options: [{ value: 'AD', label: 'Advisory' }, { value: 'CO', label: 'Company' }, { value: 'FL', label: 'Freelancer' }], defaultValue: 'CO' },
];
// @sf-generated-end fields:organization

// @sf-generated-start component:OrganizationForm
export default function OrganizationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
OrganizationForm.fields = fields;

// @sf-generated-end component:OrganizationForm
