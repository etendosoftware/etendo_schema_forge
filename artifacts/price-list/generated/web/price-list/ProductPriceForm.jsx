import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productPrice
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true, section: 'principal', reference: 'Product', inputMode: 'selector' },
  { key: 'standardPrice', column: 'PriceStd', type: 'number', label: 'Unit Price', required: true, section: 'principal' },
  { key: 'listPrice', column: 'PriceList', type: 'number', label: 'List Price', required: true, section: 'principal' },
  { key: 'cost', column: 'Cost', type: 'text', label: 'Cost', required: true, section: 'principal', defaultValue: '0' },
  { key: 'algorithm', column: 'Algorithm', type: 'select', label: 'Algorithm', required: true, section: 'other', options: [{ value: 'S', label: 'Standard', labels: {"es_ES":"Estándar"} }], defaultValue: 'S' },
];
// @sf-generated-end fields:productPrice

// @sf-generated-start component:ProductPriceForm
export default function ProductPriceForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ProductPriceForm
