import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:invoiceTax
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string', label: 'Tax' },
  { key: 'taxAmount', column: 'TaxAmt', type: 'amount', label: 'Tax Amount' },
  { key: 'taxableAmount', column: 'TaxBaseAmt', type: 'amount', label: 'Taxable Amount' },
];
// @sf-generated-end columns:invoiceTax

const filters = [];

// @sf-generated-start component:InvoiceTaxTable
export default function InvoiceTaxTable(props) {
  // @sf-custom-slot hooks:InvoiceTaxTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:InvoiceTaxTable

// @sf-custom-slot section:InvoiceTaxTable-custom
