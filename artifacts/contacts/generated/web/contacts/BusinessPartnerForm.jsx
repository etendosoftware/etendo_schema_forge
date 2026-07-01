import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:businessPartner
const fields = [
  { key: 'etgoIdentifier', column: 'EM_Etgo_Identifier', type: 'text', label: 'Identifier', readOnly: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Commercial Name', required: true, section: 'principal' },
  { key: 'etgoFirstname', column: 'EM_Etgo_Firstname', type: 'text', label: 'First Name', required: true, section: 'principal' },
  { key: 'etgoLastname', column: 'EM_Etgo_Lastname', type: 'text', label: 'Last Name', required: true, section: 'principal' },
  { key: 'oBTIKTaxIDKey', column: 'EM_OBTIK_Tax_ID_Key', type: 'select', label: 'Clave NIF País Residencia', required: true, section: 'principal', options: [{ value: '1', label: 'NIF', labels: {"es_ES":"NIF"} }, { value: '2', label: 'NOI', labels: {"es_ES":"NOI"} }, { value: '3', label: 'Pasaporte', labels: {"es_ES":"Pasaporte"} }, { value: '4', label: 'Documento oficial de identificación expedido por el país', labels: {"es_ES":"Documento oficial de identificación expedido por el país"} }, { value: '5', label: 'Certificado de residencia fiscal', labels: {"es_ES":"Certificado de residencia fiscal"} }, { value: '6', label: 'Otro documento probatorio', labels: {"es_ES":"Otro documento probatorio"} }, { value: '7', label: 'No Censado', labels: {"es_ES":"No Censado"} }], defaultValue: '\'1\'' },
  { key: 'taxID', column: 'TaxID', type: 'text', label: 'Tax ID', section: 'principal' },
  { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'text', label: 'Web', section: 'principal' },
  { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text', label: 'Email', section: 'principal' },
  { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'text', label: 'Phone', section: 'principal' },
  { key: 'creditLimit', column: 'SO_CreditLimit', type: 'number', label: 'Credit Limit', required: true, section: 'other' },
  { key: 'oBTIKVIESStatus', column: 'EM_OBTIK_VIESStatus', type: 'select', label: 'Estado VIES', readOnly: true, section: 'principal', options: [{ value: 'P', label: 'Pendiente', labels: {"es_ES":"Pendiente"} }, { value: 'V', label: 'Válido', labels: {"es_ES":"Válido"} }, { value: 'I', label: 'No válido', labels: {"es_ES":"No válido"} }], displayLogic: (record) => record.oBTIKTaxIDKey === '2' },
];
// @sf-generated-end fields:businessPartner

// @sf-generated-start component:BusinessPartnerForm
export default function BusinessPartnerForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:BusinessPartnerForm
