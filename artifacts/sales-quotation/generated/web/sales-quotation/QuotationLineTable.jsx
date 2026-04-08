import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:quotationLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string' },
  { key: 'discount', column: 'Discount', type: 'number' },
];
// @sf-generated-end columns:quotationLine

const filters = ['product'];

// @sf-generated-start component:QuotationLineTable
export default function QuotationLineTable(props) {
  // @sf-custom-slot hooks:QuotationLineTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:QuotationLineTable

// @sf-custom-slot section:QuotationLineTable-custom
