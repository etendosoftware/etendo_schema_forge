import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpLocation
const fields = [
  { key: 'streetName', column: 'EM_OBSEPA_StrtNm', type: 'text', label: 'EM_OBSEPA_StrtNm', required: true, section: 'principal', maxLength: 70 },
  { key: 'buildingNumber', column: 'EM_OBSEPA_BldgNb', type: 'text', label: 'EM_OBSEPA_BldgNb', required: true, section: 'principal', maxLength: 16 },
  { key: 'buildingName', column: 'EM_OBSEPA_BldgNm', type: 'text', label: 'EM_OBSEPA_BldgNm', section: 'principal', maxLength: 35 },
  { key: 'addressLine1', column: 'Address1', type: 'text', label: 'Address Line 1', readOnly: true, section: 'principal', maxLength: 60 },
  { key: 'addressLine2', column: 'Address2', type: 'text', label: 'Address Line 2', readOnly: true, section: 'principal', maxLength: 60 },
  { key: 'country', column: 'C_Country_ID', type: 'selector', label: 'Country', required: true, section: 'principal', reference: 'Country', inputMode: 'selector' },
  { key: 'cityName', column: 'City', type: 'text', label: 'City Name', section: 'principal', maxLength: 60 },
  { key: 'postalCode', column: 'Postal', type: 'text', label: 'Postal Code', section: 'principal', maxLength: 10 },
  { key: 'region', column: 'C_Region_ID', type: 'selector', label: 'Region', section: 'principal', reference: 'Region', inputMode: 'selector' },
];
// @sf-generated-end fields:bpLocation

// @sf-generated-start component:BpLocationForm
export default function BpLocationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
BpLocationForm.fields = fields;

// @sf-generated-end component:BpLocationForm
