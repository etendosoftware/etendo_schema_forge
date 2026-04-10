import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:conversion
const fields = [
  { key: 'toUOM', column: 'C_UOM_To_ID', type: 'selector', label: 'To UOM', required: true, section: 'principal', reference: 'UOM', inputMode: 'selector' },
  { key: 'multipleRateBy', column: 'MultiplyRate', type: 'text', label: 'Multiple Rate By', required: true, section: 'principal' },
  { key: 'divideRateBy', column: 'DivideRate', type: 'text', label: 'Divide Rate By', required: true, section: 'principal' },
];
// @sf-generated-end fields:conversion

// @sf-generated-start component:ConversionForm
export default function ConversionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ConversionForm
