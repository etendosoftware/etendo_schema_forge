import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:priceListVersion
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'validFromDate', column: 'ValidFrom', type: 'date', label: 'Valid From Date', required: true, section: 'principal' },
  { key: 'priceListSchema', column: 'M_DiscountSchema_ID', type: 'selector', label: 'Price List Schema', required: true, section: 'principal', reference: 'DiscountSchema', inputMode: 'selector' },
  { key: 'basePriceListVersion', column: 'M_Pricelist_Version_Base_ID', type: 'search', label: 'Base Version (Default)', section: 'principal', reference: 'PriceList_Version', inputMode: 'search' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
];
// @sf-generated-end fields:priceListVersion

// @sf-generated-start component:PriceListVersionForm
export default function PriceListVersionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
PriceListVersionForm.fields = fields;

// @sf-generated-end component:PriceListVersionForm
