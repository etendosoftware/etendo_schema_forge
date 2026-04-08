import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:invoiceReverse
const fields = [
  { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', type: 'search', label: 'Reversed Invoice', required: true, section: 'principal', reference: 'Invoice', inputMode: 'search' },
];
// @sf-generated-end fields:invoiceReverse

// @sf-generated-start component:InvoiceReverseForm
export default function InvoiceReverseForm(props) {
  // @sf-custom-slot hooks:InvoiceReverseForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:InvoiceReverseForm

// @sf-custom-slot section:InvoiceReverseForm-custom
