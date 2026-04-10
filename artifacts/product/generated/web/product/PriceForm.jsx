import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:price
const fields = [
  { key: 'priceListVersion', column: 'M_PriceList_Version_ID', type: 'selector', label: 'Price List Version', required: true, section: 'principal', reference: 'PriceListVersion', inputMode: 'selector' },
  { key: 'standardPrice', column: 'PriceStd', type: 'number', label: 'Unit Price', required: true, section: 'principal' },
  { key: 'listPrice', column: 'PriceList', type: 'number', label: 'List Price', required: true, section: 'principal' },
];
// @sf-generated-end fields:price

// @sf-generated-start component:PriceForm
export default function PriceForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PriceForm
