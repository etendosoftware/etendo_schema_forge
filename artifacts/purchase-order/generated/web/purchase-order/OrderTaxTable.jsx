import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:orderTax
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string' },
  { key: 'taxAmount', column: 'TaxAmt', type: 'amount' },
  { key: 'taxableAmount', column: 'TaxBaseAmt', type: 'amount' },
];
// @sf-generated-end columns:orderTax

const filters = [];

// @sf-generated-start component:OrderTaxTable
export default function OrderTaxTable(props) {
  // @sf-custom-slot hooks:OrderTaxTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:OrderTaxTable

// @sf-custom-slot section:OrderTaxTable-custom
