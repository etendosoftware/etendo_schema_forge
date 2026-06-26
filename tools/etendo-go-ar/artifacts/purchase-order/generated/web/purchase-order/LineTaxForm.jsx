import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lineTax
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_ORDERLINETAX WHERE C_ORDERLINE_ID=@C_OrderLine_ID@' },
  { key: 'tax', column: 'C_Tax_ID', type: 'search', label: 'Tax', required: true, readOnly: true, section: 'other', reference: 'Tax' },
  { key: 'taxableAmount', column: 'Taxbaseamt', type: 'number', label: 'Taxable Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'taxAmount', column: 'Taxamt', type: 'number', label: 'Tax Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:lineTax

// @sf-generated-start component:LineTaxForm
export default function LineTaxForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:LineTaxForm
