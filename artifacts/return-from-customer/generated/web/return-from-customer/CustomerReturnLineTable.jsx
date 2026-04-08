import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:customerReturnLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Return Qty' },
  { key: 'unitPrice', column: 'PriceActual', type: 'amount' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount' },
];
// @sf-generated-end columns:customerReturnLine

const filters = ['product'];

// @sf-generated-start component:CustomerReturnLineTable
export default function CustomerReturnLineTable(props) {
  // @sf-custom-slot hooks:CustomerReturnLineTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:CustomerReturnLineTable

// @sf-custom-slot section:CustomerReturnLineTable-custom
