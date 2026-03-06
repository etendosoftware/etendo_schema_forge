import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'goodsReceipt', label: 'Goods Receipt', type: 'string' },
  { key: 'documentNo', label: 'Document No', type: 'string' },
];

const filters = ['goodsReceipt', 'documentNo'];

export default function LandedCostReceiptTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
