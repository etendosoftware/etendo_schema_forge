import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'product', label: 'Product', type: 'search', required: true, reference: 'Product', inputMode: 'search' },
  { key: 'quantity', label: 'Quantity', type: 'number', required: true },
  { key: 'unitPrice', label: 'Unit Price', type: 'number', required: true },
  { key: 'tax', label: 'Tax', type: 'selector', required: true, reference: 'Tax', inputMode: 'selector' },
  { key: 'discount', label: 'Discount', type: 'number' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'lineNo', label: 'Line No', type: 'number', required: true },
];

export default function OrderLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
