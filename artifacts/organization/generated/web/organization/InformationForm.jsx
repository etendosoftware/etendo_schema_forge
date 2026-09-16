import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:information
const fields = [
  { key: 'locationAddress', column: 'C_Location_ID', type: 'search', label: 'Location / Address', required: true, section: 'principal', reference: 'Location', inputMode: 'search' },
  { key: 'taxID', column: 'TaxID', type: 'text', label: 'Tax ID', required: true, section: 'principal', maxLength: 20 },
  { key: 'yourCompanyDocumentImage', column: 'Your_Company_Document_Image', type: 'text', label: 'Your Company Document Image', section: 'principal', maxLength: 32 },
  { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text', label: 'Email', section: 'principal', maxLength: 60 },
  { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'text', label: 'Phone', section: 'other', maxLength: 60 },
  { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'text', label: 'Web', section: 'other', maxLength: 60 },
];
// @sf-generated-end fields:information

// @sf-generated-start component:InformationForm
export default function InformationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
InformationForm.fields = fields;

// @sf-generated-end component:InformationForm
