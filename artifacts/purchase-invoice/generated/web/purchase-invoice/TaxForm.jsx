import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:tax
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_INVOICETAX WHERE C_Invoice_ID=@C_Invoice_ID@' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', required: true, readOnly: true, section: 'other', reference: 'Tax', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true || record['recalculate'] === true },
  { key: 'taxAmount', column: 'TaxAmt', type: 'number', label: 'Tax Amount', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true || record['recalculate'] === true },
  { key: 'taxableAmount', column: 'TaxBaseAmt', type: 'number', label: 'Taxable Amount', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true || record['recalculate'] === true },
];
// @sf-generated-end fields:tax

// @sf-generated-start component:TaxForm
export default function TaxForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
TaxForm.fields = fields;

// @sf-generated-end component:TaxForm
