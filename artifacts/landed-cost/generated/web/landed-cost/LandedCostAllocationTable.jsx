import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'goodsReceiptLine', label: 'Goods Receipt Line', type: 'string' },
  { key: 'product', label: 'Product', type: 'string' },
  { key: 'amount', label: 'Amount', type: 'amount' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'baseAmount', label: 'Base Amount', type: 'amount' },
];

const filters = ['goodsReceiptLine', 'product'];

export default function LandedCostAllocationTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
