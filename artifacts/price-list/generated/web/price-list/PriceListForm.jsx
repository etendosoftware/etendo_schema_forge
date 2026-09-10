import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:priceList
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'principal', reference: 'Currency', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'salesPriceList', column: 'IsSOPriceList', type: 'checkbox', labels: {"es_ES":"Tipo","en_US":"Type"}, label: 'Sales Price List', required: true, section: 'principal' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', labels: {"es_ES":"Por defecto","en_US":"Default"}, label: 'Default', required: true, section: 'principal' },
  { key: 'active', column: 'IsActive', type: 'checkbox', labels: {"es_ES":"Activo","en_US":"Active"}, label: 'Active', required: true, section: 'principal' },
];
// @sf-generated-end fields:priceList

// @sf-generated-start component:PriceListForm
export default function PriceListForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
PriceListForm.fields = fields;

// @sf-generated-end component:PriceListForm
