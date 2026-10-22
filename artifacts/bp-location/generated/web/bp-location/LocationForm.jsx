import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:location
const fields = [
  { key: 'oBSEPAStreetName', column: 'EM_OBSEPA_StrtNm', type: 'text', label: 'EM_OBSEPA_StrtNm', required: true, section: 'principal', maxLength: 70 },
  { key: 'oBSEPABuildingNumber', column: 'EM_OBSEPA_BldgNb', type: 'text', label: 'EM_OBSEPA_BldgNb', required: true, section: 'principal', maxLength: 16 },
  { key: 'oBSEPABuildingName', column: 'EM_OBSEPA_BldgNm', type: 'text', label: 'EM_OBSEPA_BldgNm', section: 'principal', maxLength: 35 },
  { key: 'addressLine1', column: 'Address1', type: 'text', label: 'Address Line 1', readOnly: true, section: 'principal', maxLength: 60 },
  { key: 'addressLine2', column: 'Address2', type: 'text', label: 'Address Line 2', readOnly: true, section: 'principal', maxLength: 60 },
  { key: 'country', column: 'C_Country_ID', type: 'selector', label: 'Country', required: true, section: 'principal', reference: 'Country', inputMode: 'selector' },
  { key: 'cityName', column: 'City', type: 'text', label: 'City Name', section: 'principal', maxLength: 60 },
  { key: 'postalCode', column: 'Postal', type: 'text', label: 'Postal Code', section: 'principal', maxLength: 10 },
  { key: 'region', column: 'C_Region_ID', type: 'selector', label: 'Region', section: 'principal', reference: 'Region', inputMode: 'selector' },
];
// @sf-generated-end fields:location

// @sf-generated-start component:LocationForm
export default function LocationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
LocationForm.fields = fields;

// @sf-generated-end component:LocationForm
