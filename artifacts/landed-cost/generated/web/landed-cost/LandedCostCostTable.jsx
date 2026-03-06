import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'landedCostType', label: 'Landed Cost Type', type: 'string' },
  { key: 'amount', label: 'Amount', type: 'amount' },
  { key: 'landedCostDistribution', label: 'Landed Cost Distribution', type: 'string' },
  { key: 'goodsReceipt', label: 'Goods Receipt', type: 'string' },
  { key: 'goodsReceiptLine', label: 'Goods Receipt Line', type: 'string' },
  { key: 'lineNo', label: 'Line No', type: 'number' },
  { key: 'accountingDate', label: 'Accounting Date', type: 'date' },
];

const filters = ['landedCostType', 'goodsReceipt'];

export default function LandedCostCostTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
