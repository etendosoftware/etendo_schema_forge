import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'product', label: 'Product', type: 'string' },
  { key: 'movementQty', label: 'Movement Qty', type: 'number' },
  { key: 'locator', label: 'Locator', type: 'string' },
  { key: 'lineNo', label: 'Line No', type: 'number' },
  { key: 'uom', label: 'Uom', type: 'string' },
];

const filters = ['product'];

export default function GoodsReceiptLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
