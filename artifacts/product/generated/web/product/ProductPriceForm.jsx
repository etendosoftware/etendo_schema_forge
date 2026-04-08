import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productPrice
const fields = [
  { key: 'priceListVersion', column: 'M_PriceList_Version_ID', type: 'selector', required: true, section: 'principal', reference: 'PriceListVersion', inputMode: 'selector' },
  { key: 'standardPrice', column: 'PriceStd', type: 'text', required: true, section: 'principal' },
  { key: 'listPrice', column: 'PriceList', type: 'text', required: true, section: 'principal' },
];
// @sf-generated-end fields:productPrice

// @sf-generated-start component:ProductPriceForm
export default function ProductPriceForm(props) {
  // @sf-custom-slot hooks:ProductPriceForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductPriceForm

// @sf-custom-slot section:ProductPriceForm-custom
