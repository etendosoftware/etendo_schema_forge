import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:tax
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string', label: 'Tax' },
  { key: 'taxAmount', column: 'TaxAmt', type: 'amount', label: 'Tax Amount' },
  { key: 'taxableAmount', column: 'TaxBaseAmt', type: 'amount', label: 'Taxable Amount' },
];
// @sf-generated-end columns:tax

const filters = [];

// @sf-generated-start component:TaxTable
export default function TaxTable(props) {
  // @sf-custom-slot hooks:TaxTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:TaxTable

// @sf-custom-slot section:TaxTable-custom
