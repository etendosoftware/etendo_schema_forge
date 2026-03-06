import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'product', label: 'Product', type: 'string' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'unitPrice', label: 'Unit Price', type: 'amount' },
  { key: 'tax', label: 'Tax', type: 'string' },
  { key: 'discount', label: 'Discount', type: 'number' },
  { key: 'lineNo', label: 'Line No', type: 'number' },
  { key: 'lineNetAmount', label: 'Line Net Amount', type: 'amount' },
  { key: 'uom', label: 'Uom', type: 'string' },
  { key: 'taxAmount', label: 'Tax Amount', type: 'amount' },
];

const filters = ['product'];

export default function InvoiceLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
