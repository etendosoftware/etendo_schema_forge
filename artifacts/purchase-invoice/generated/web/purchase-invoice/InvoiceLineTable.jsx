import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:invoiceLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: 'Invoiced Quantity' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number', label: 'Net Unit Price' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', label: 'Line Net Amount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string', label: 'Tax' },
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
