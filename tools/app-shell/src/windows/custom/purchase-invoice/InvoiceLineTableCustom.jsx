import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'product',           column: 'M_Product_ID', type: 'string' },
  { key: 'invoicedQuantity',  column: 'QtyInvoiced',  type: 'string', label: 'Quantity' },
  { key: 'unitPrice',         column: 'PriceActual',  type: 'string' },
  { key: 'tax',               column: 'C_Tax_ID',     type: 'string' },
  { key: 'lineNetAmount',     column: 'LineNetAmt',   type: 'amount' },
];

export default function InvoiceLineTableCustom(props) {
  return <DataTable columns={columns} filters={[]} {...props} />;
}
