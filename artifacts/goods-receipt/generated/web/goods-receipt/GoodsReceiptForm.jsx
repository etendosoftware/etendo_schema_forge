import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'businessPartner', label: 'Business Partner', type: 'search', required: true, reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'partnerAddress', label: 'Partner Address', type: 'dependent', required: true, reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'businessPartnerId' } },
  { key: 'movementDate', label: 'Movement Date', type: 'date', required: true },
  { key: 'dateAcct', label: 'Date Acct', type: 'date', required: true },
  { key: 'warehouse', label: 'Warehouse', type: 'selector', required: true, reference: 'Warehouse', inputMode: 'selector' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'poReference', label: 'Po Reference', type: 'text' },
  { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
];

export default function GoodsReceiptForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
