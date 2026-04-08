import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:reversedInvoices
const fields = [
  { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', type: 'search', label: 'Reversed Invoice', required: true, readOnly: true, section: 'other', reference: 'Invoice', inputMode: 'search' },
];
// @sf-generated-end fields:reversedInvoices

// @sf-generated-start component:ReversedInvoicesForm
export default function ReversedInvoicesForm(props) {
  // @sf-custom-slot hooks:ReversedInvoicesForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ReversedInvoicesForm

// @sf-custom-slot section:ReversedInvoicesForm-custom
