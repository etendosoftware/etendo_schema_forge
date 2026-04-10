import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:alternateUom
const fields = [
  { key: 'uOM', column: 'C_Uom_ID', type: 'selector', label: 'UOM', required: true, section: 'principal', reference: 'UOM', inputMode: 'selector' },
  { key: 'conversionRate', column: 'Conversionrate', type: 'number', label: 'Conversion Rate', required: true, section: 'principal' },
  { key: 'gtin', column: 'Gtin', type: 'text', label: 'Gtin', section: 'principal' },
  { key: 'sales', column: 'Sales', type: 'select', label: 'Sales', required: true, section: 'principal', options: [{ value: 'P', label: 'Primary' }, { value: 'S', label: 'Secondary' }, { value: 'NA', label: 'Not Applicable' }], defaultValue: 'S' },
  { key: 'purchase', column: 'Purchase', type: 'select', label: 'Purchase', required: true, section: 'other', options: [{ value: 'P', label: 'Primary' }, { value: 'S', label: 'Secondary' }, { value: 'NA', label: 'Not Applicable' }], defaultValue: 'S' },
  { key: 'logistics', column: 'Logistics', type: 'select', label: 'Logistics', required: true, section: 'other', options: [{ value: 'P', label: 'Primary' }, { value: 'S', label: 'Secondary' }, { value: 'NA', label: 'Not Applicable' }], defaultValue: 'S' },
];
// @sf-generated-end fields:alternateUom

// @sf-generated-start component:AlternateUomForm
export default function AlternateUomForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:AlternateUomForm
