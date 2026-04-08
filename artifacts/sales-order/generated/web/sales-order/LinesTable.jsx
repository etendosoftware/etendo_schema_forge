import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number', label: 'Net Unit Price' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', label: 'Line Net Amount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string', label: 'Tax' },
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount' },
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
