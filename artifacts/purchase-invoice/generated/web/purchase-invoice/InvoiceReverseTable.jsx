import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:invoiceReverse
const columns = [

];
// @sf-generated-end columns:invoiceReverse

const filters = [];

// @sf-generated-start component:InvoiceReverseTable
export default function InvoiceReverseTable(props) {
  // @sf-custom-slot hooks:InvoiceReverseTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:InvoiceReverseTable

// @sf-custom-slot section:InvoiceReverseTable-custom
