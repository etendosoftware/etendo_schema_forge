import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:quotationLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number', label: 'Net Unit Price' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', label: 'Line Net Amount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string', label: 'Tax' },
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount' },
];
// @sf-generated-end columns:quotationLine

const filters = ['product'];

// @sf-generated-start component:QuotationLineTable
export default function QuotationLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:QuotationLineTable
