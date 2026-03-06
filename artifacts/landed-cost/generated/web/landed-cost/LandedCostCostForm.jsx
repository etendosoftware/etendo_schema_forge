import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'landedCostType', label: 'Landed Cost Type', type: 'selector', required: true, reference: 'LandedCostType', inputMode: 'selector' },
  { key: 'amount', label: 'Amount', type: 'number', required: true },
  { key: 'landedCostDistribution', label: 'Landed Cost Distribution', type: 'text', required: true },
  { key: 'goodsReceipt', label: 'Goods Receipt', type: 'search', reference: 'GoodsReceipt', inputMode: 'search' },
  { key: 'goodsReceiptLine', label: 'Goods Receipt Line', type: 'dependent', reference: 'GoodsReceiptLine', inputMode: 'dependent', dependsOn: { field: 'goodsReceipt', filterKey: 'goodsReceiptId' } },
  { key: 'invoiceLine', label: 'Invoice Line', type: 'search', reference: 'InvoiceLine', inputMode: 'search' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'lineNo', label: 'Line No', type: 'number', required: true },
  { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
];

export default function LandedCostCostForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
