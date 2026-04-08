import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:invoiceLineTax
const columns = [

];
// @sf-generated-end columns:invoiceLineTax

const filters = [];

// @sf-generated-start component:InvoiceLineTaxTable
export default function InvoiceLineTaxTable(props) {
  // @sf-custom-slot hooks:InvoiceLineTaxTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:InvoiceLineTaxTable

// @sf-custom-slot section:InvoiceLineTaxTable-custom
