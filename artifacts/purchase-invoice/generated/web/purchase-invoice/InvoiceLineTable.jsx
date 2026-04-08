import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:invoiceLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number' },
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'string' },
  { key: 'unitPrice', column: 'PriceActual', type: 'string' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string' },
];
// @sf-generated-end columns:invoiceLine

const filters = [];

// @sf-generated-start component:InvoiceLineTable
export default function InvoiceLineTable(props) {
  // @sf-custom-slot hooks:InvoiceLineTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:InvoiceLineTable

// @sf-custom-slot section:InvoiceLineTable-custom
