import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'businessPartner', label: 'Business Partner', type: 'search', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'dateRequired', label: 'Date Required', type: 'date', required: true },
  { key: 'warehouse', label: 'Warehouse', type: 'selector', required: true, reference: 'Warehouse', inputMode: 'selector' },
  { key: 'priceList', label: 'Price List', type: 'selector', required: true, reference: 'PriceList', inputMode: 'selector' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
];

export default function RequisitionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
