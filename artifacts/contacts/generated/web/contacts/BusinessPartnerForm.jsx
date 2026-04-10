import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:businessPartner
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Commercial Name', required: true, section: 'principal' },
  { key: 'taxID', column: 'TaxID', type: 'text', label: 'Tax ID', section: 'principal' },
  { key: 'businessPartnerCategory', column: 'C_BP_Group_ID', type: 'selector', label: 'Business Partner Category', required: true, section: 'principal', reference: 'BusinessPartnerCategory', inputMode: 'selector', defaultValue: '@SQL=SELECT MAX(C_BP_GROUP_ID) FROM C_BP_GROUP WHERE AD_ISORGINCLUDED(@AD_ORG_ID@, AD_ORG_ID, @#AD_CLIENT_ID@) <> -1 AND ISDEFAULT = \'Y\' AND AD_CLIENT_ID = @#AD_CLIENT_ID@' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'oBTIKTaxIDKey', column: 'EM_OBTIK_Tax_ID_Key', type: 'select', label: 'Clave NIF País Residencia', required: true, section: 'principal', options: [{ value: '1', label: 'NIF' }, { value: '2', label: 'NOI' }, { value: '3', label: 'Pasaporte' }, { value: '4', label: 'Documento oficial de identificación expedido por el país' }, { value: '5', label: 'Certificado de residencia fiscal' }, { value: '6', label: 'Otro documento probatorio' }, { value: '7', label: 'No Censado' }], defaultValue: '\'1\'' },
  { key: 'creditLimit', column: 'SO_CreditLimit', type: 'number', label: 'Credit Limit', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:businessPartner

// @sf-generated-start component:BusinessPartnerForm
export default function BusinessPartnerForm(props) {
  // @sf-custom-slot hooks:BusinessPartnerForm
  return <EntityForm fields={fields} {...props} />;
}
BusinessPartnerForm.hasCollapsedFields = false;
// @sf-generated-end component:BusinessPartnerForm

// @sf-custom-slot section:BusinessPartnerForm-custom
