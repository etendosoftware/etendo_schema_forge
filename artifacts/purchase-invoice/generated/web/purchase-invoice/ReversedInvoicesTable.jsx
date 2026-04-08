import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:reversedInvoices
const columns = [
  { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', type: 'string', label: 'Reversed Invoice' },
];
// @sf-generated-end columns:reversedInvoices

const filters = [];

// @sf-generated-start component:ReversedInvoicesTable
export default function ReversedInvoicesTable(props) {
  // @sf-custom-slot hooks:ReversedInvoicesTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ReversedInvoicesTable

// @sf-custom-slot section:ReversedInvoicesTable-custom
