import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:invoiceLineTax
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal' },
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', required: true, section: 'principal', reference: 'Tax', inputMode: 'selector' },
  { key: 'taxableAmount', column: 'Taxbaseamt', type: 'number', label: 'Taxable Amount', required: true, section: 'principal' },
  { key: 'taxAmount', column: 'Taxamt', type: 'number', label: 'Tax Amount', required: true, section: 'other' },
];
// @sf-generated-end fields:invoiceLineTax

// @sf-generated-start component:InvoiceLineTaxForm
export default function InvoiceLineTaxForm(props) {
  // @sf-custom-slot hooks:InvoiceLineTaxForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:InvoiceLineTaxForm

// @sf-custom-slot section:InvoiceLineTaxForm-custom
