import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:orderLineTax
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', readOnly: true, section: 'other' },
  { key: 'tax', column: 'C_Tax_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Tax' },
  { key: 'taxableAmount', column: 'Taxbaseamt', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'taxAmount', column: 'Taxamt', type: 'number', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:orderLineTax

// @sf-generated-start component:OrderLineTaxForm
export default function OrderLineTaxForm(props) {
  // @sf-custom-slot hooks:OrderLineTaxForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:OrderLineTaxForm

// @sf-custom-slot section:OrderLineTaxForm-custom
