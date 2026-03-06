import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'businessPartner', label: 'Business Partner', type: 'search', required: true, reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'documentDate', label: 'Document Date', type: 'date', required: true },
  { key: 'returnDate', label: 'Return Date', type: 'date' },
  { key: 'originalReceipt', label: 'Original Receipt', type: 'search', required: true, reference: 'MaterialReceipt', inputMode: 'search' },
  { key: 'warehouse', label: 'Warehouse', type: 'selector', required: true, reference: 'Warehouse', inputMode: 'selector' },
  { key: 'returnReason', label: 'Return Reason', type: 'text' },
  { key: 'salesRepresentative', label: 'Sales Representative', type: 'search', reference: 'User', inputMode: 'search' },
];

export default function ReturnMaterialForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
