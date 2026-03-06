import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'originalReceiptLine', label: 'Original Receipt Line', type: 'string' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'lineNo', label: 'Line No', type: 'number' },
  { key: 'product', label: 'Product', type: 'string' },
  { key: 'uom', label: 'Uom', type: 'string' },
  { key: 'lineAmount', label: 'Line Amount', type: 'amount' },
];

const filters = ['product'];

export default function ReturnMaterialLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
