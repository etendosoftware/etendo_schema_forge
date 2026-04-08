import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:orderLineTax
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_ORDERLINETAX WHERE C_ORDERLINE_ID=@C_OrderLine_ID@' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'Tax', inputMode: 'selector' },
  { key: 'taxableAmount', column: 'Taxbaseamt', type: 'number', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'taxAmount', column: 'Taxamt', type: 'number', required: true, readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:orderLineTax

// @sf-generated-start component:OrderLineTaxForm
export default function OrderLineTaxForm(props) {
  // @sf-custom-slot hooks:OrderLineTaxForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:OrderLineTaxForm

// @sf-custom-slot section:OrderLineTaxForm-custom
