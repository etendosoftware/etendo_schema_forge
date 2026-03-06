import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'product', label: 'Product', type: 'string' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'unitPrice', label: 'Unit Price', type: 'amount' },
  { key: 'lineNo', label: 'Line No', type: 'number' },
  { key: 'needByDate', label: 'Need By Date', type: 'date' },
  { key: 'lineNetAmount', label: 'Line Net Amount', type: 'amount' },
  { key: 'uom', label: 'Uom', type: 'string' },
];

const filters = ['product'];

export default function RequisitionLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
