import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:information
const fields = [
  { key: 'locationAddress', column: 'C_Location_ID', type: 'search', label: 'Location / Address', required: true, section: 'principal', reference: 'Location', inputMode: 'search' },
  { key: 'taxID', column: 'TaxID', type: 'text', label: 'Tax ID', required: true, section: 'principal', maxLength: 20 },
  { key: 'yourCompanyDocumentImage', column: 'Your_Company_Document_Image', type: 'text', label: 'Your Company Document Image', section: 'principal', maxLength: 32 },
  { key: 'aeat390Isperson', column: 'EM_Aeat390_Isperson', type: 'checkbox', label: 'Persona Física 390', required: true, section: 'principal' },
  { key: 'aeat390Firstname', column: 'EM_Aeat390_Firstname', type: 'text', label: 'Nombre', section: 'other', maxLength: 60 },
  { key: 'aeat390Surname1', column: 'EM_Aeat390_Surname1', type: 'text', label: 'Primer Apellido', section: 'other', maxLength: 60 },
  { key: 'aeat390Surname2', column: 'EM_Aeat390_Surname2', type: 'text', label: 'Segundo Apellido', section: 'other', maxLength: 60 },
  { key: 'aeat390RepNif', column: 'EM_Aeat390_Rep_Nif', type: 'text', label: 'NIF del Representante Legal', section: 'other', maxLength: 20 },
  { key: 'aeat390RepName', column: 'EM_Aeat390_Rep_Name', type: 'text', label: 'Nombre del Representante Legal', section: 'other', maxLength: 60 },
  { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text', label: 'Email', section: 'other', maxLength: 60 },
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
