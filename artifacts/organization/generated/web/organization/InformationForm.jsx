import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:information
const fields = [
  { key: 'locationAddress', column: 'C_Location_ID', type: 'search', label: 'Location / Address', required: true, section: 'principal', reference: 'Location', inputMode: 'search' },
  { key: 'taxID', column: 'TaxID', type: 'text', label: 'Tax ID', required: true, section: 'principal' },
  { key: 'yourCompanyDocumentImage', column: 'Your_Company_Document_Image', type: 'text', label: 'Your Company Document Image', section: 'principal' },
  { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text', label: 'Email', section: 'principal' },
  { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'text', label: 'Phone', section: 'other' },
  { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'text', label: 'Web', section: 'other' },
];
// @sf-generated-end fields:information

// @sf-generated-start component:InformationForm
export default function InformationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
InformationForm.fields = fields;

// @sf-generated-end component:InformationForm
