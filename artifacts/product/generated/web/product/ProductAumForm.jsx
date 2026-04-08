import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productAum
const fields = [
  // @sf-custom-slot callout:AUM_ConversionRate
  { key: 'uOM', column: 'C_Uom_ID', type: 'selector', required: true, section: 'principal', reference: 'UOM', inputMode: 'selector' },
  { key: 'conversionRate', column: 'Conversionrate', type: 'text', required: true, section: 'principal' },
  // @sf-custom-slot callout:GtinFormat
  { key: 'gtin', column: 'Gtin', type: 'text', section: 'principal' },
  { key: 'sales', column: 'Sales', type: 'select', required: true, section: 'principal', options: [{ value: 'P', label: 'Primary' }, { value: 'S', label: 'Secondary' }, { value: 'NA', label: 'Not Applicable' }], defaultValue: 'S' },
  { key: 'purchase', column: 'Purchase', type: 'select', required: true, section: 'other', options: [{ value: 'P', label: 'Primary' }, { value: 'S', label: 'Secondary' }, { value: 'NA', label: 'Not Applicable' }], defaultValue: 'S' },
  { key: 'logistics', column: 'Logistics', type: 'select', required: true, section: 'other', options: [{ value: 'P', label: 'Primary' }, { value: 'S', label: 'Secondary' }, { value: 'NA', label: 'Not Applicable' }], defaultValue: 'S' },
];
// @sf-generated-end fields:productAum

// @sf-generated-start component:ProductAumForm
export default function ProductAumForm(props) {
  // @sf-custom-slot hooks:ProductAumForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductAumForm

// @sf-custom-slot section:ProductAumForm-custom
