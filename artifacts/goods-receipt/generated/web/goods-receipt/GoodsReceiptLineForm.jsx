import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'product', label: 'Product', type: 'search', required: true, reference: 'Product', inputMode: 'search' },
  { key: 'movementQty', label: 'Movement Qty', type: 'number', required: true },
  { key: 'locator', label: 'Locator', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
  { key: 'lineNo', label: 'Line No', type: 'number', required: true },
  { key: 'description', label: 'Description', type: 'text' },
];

export default function GoodsReceiptLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
