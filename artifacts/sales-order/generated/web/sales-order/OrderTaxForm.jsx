import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:orderTax
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_ORDERTAX WHERE C_Order_ID=@C_Order_ID@' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'Tax', inputMode: 'selector' },
  { key: 'taxAmount', column: 'TaxAmt', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'taxableAmount', column: 'TaxBaseAmt', type: 'number', required: true, readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:orderTax

// @sf-generated-start component:OrderTaxForm
export default function OrderTaxForm(props) {
  // @sf-custom-slot hooks:OrderTaxForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:OrderTaxForm

// @sf-custom-slot section:OrderTaxForm-custom
