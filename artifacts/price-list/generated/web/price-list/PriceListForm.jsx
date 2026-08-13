import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:priceList
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'principal', reference: 'Currency', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'salesPriceList', column: 'IsSOPriceList', type: 'checkbox', label: 'Sales Price List', required: true, section: 'principal' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', required: true, section: 'principal' },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, section: 'principal' },
];
// @sf-generated-end fields:priceList

// @sf-generated-start component:PriceListForm
export default function PriceListForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:PriceListForm
