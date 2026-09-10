import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:locationAddress
const fields = [
  { key: 'locationAddress', column: 'C_Location_ID', type: 'search', label: 'Location / Address', required: true, section: 'principal', reference: 'Location', inputMode: 'search' },
  { key: 'phone', column: 'Phone', type: 'text', label: 'Phone', section: 'other' },
  { key: 'alternativePhone', column: 'Phone2', type: 'text', label: 'Alternative Phone', section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', labels: {"en_US":"Location / Address","es_ES":"Dirección"}, label: 'Name', required: true, section: 'principal', defaultValue: '.' },
  { key: 'fax', column: 'Fax', type: 'text', label: 'Fax', section: 'principal' },
  { key: 'shipToAddress', column: 'IsShipTo', type: 'checkbox', labels: {"en_US":"Shipping Address","es_ES":"Dir.envíos"}, label: 'Shipping Address', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'invoiceToAddress', column: 'IsBillTo', type: 'checkbox', labels: {"en_US":"Invoicing Address","es_ES":"Dir.factura"}, label: 'Invoicing Address', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other' },
  { key: 'taxLocation', column: 'IsTaxLocation', type: 'checkbox', label: 'Tax Location', required: true, section: 'principal' },
];
// @sf-generated-end fields:locationAddress

// @sf-generated-start component:LocationAddressForm
export default function LocationAddressForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
LocationAddressForm.fields = fields;

// @sf-generated-end component:LocationAddressForm
