import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'businessPartner', label: 'Business Partner', type: 'search', required: true, reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'partnerAddress', label: 'Partner Address', type: 'dependent', required: true, reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'businessPartnerId' } },
  { key: 'orderDate', label: 'Order Date', type: 'date', required: true },
  { key: 'datePromised', label: 'Date Promised', type: 'date', required: true },
  { key: 'warehouse', label: 'Warehouse', type: 'selector', required: true, reference: 'Warehouse', inputMode: 'selector' },
  { key: 'priceList', label: 'Price List', type: 'selector', required: true, reference: 'PriceList', inputMode: 'selector' },
  { key: 'paymentTerms', label: 'Payment Terms', type: 'selector', required: true, reference: 'PaymentTerm', inputMode: 'selector' },
  { key: 'paymentMethod', label: 'Payment Method', type: 'selector', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'invoiceAddress', label: 'Invoice Address', type: 'dependent', required: true, reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'businessPartnerId' } },
  { key: 'deliveryLocation', label: 'Delivery Location', type: 'text' },
  { key: 'poReference', label: 'Po Reference', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
];

export default function OrderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
