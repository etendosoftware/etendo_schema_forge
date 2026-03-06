import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'originalReceiptLine', label: 'Original Receipt Line', type: 'selector', required: true, reference: 'MaterialReceiptLine', inputMode: 'selector' },
  { key: 'quantity', label: 'Quantity', type: 'number', required: true },
  { key: 'lineNo', label: 'Line No', type: 'number', required: true },
  { key: 'description', label: 'Description', type: 'text' },
];

export default function ReturnMaterialLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
