import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string' },
  { key: 'discount', column: 'Discount', type: 'number' },
];
// @sf-generated-end columns:lines

const filters = ['product'];

// @sf-generated-start component:LinesTable
export default function LinesTable(props) {
  // @sf-custom-slot hooks:LinesTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:LinesTable

// @sf-custom-slot section:LinesTable-custom
