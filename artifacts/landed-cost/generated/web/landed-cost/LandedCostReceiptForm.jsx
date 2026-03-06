import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'goodsReceipt', label: 'Goods Receipt', type: 'search', required: true, reference: 'GoodsReceipt', inputMode: 'search' },
  { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
];

export default function LandedCostReceiptForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
