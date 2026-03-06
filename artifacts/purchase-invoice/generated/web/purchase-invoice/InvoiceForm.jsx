import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'businessPartner', label: 'Business Partner', type: 'search', required: true, reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'partnerAddress', label: 'Partner Address', type: 'dependent', required: true, reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'businessPartnerId' } },
  { key: 'dateInvoiced', label: 'Date Invoiced', type: 'date', required: true },
  { key: 'dateAcct', label: 'Date Acct', type: 'date', required: true },
  { key: 'paymentTerms', label: 'Payment Terms', type: 'selector', required: true, reference: 'PaymentTerm', inputMode: 'selector' },
  { key: 'paymentMethod', label: 'Payment Method', type: 'selector', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'priceList', label: 'Price List', type: 'selector', required: true, reference: 'PriceList', inputMode: 'selector' },
  { key: 'currency', label: 'Currency', type: 'selector', required: true, reference: 'Currency', inputMode: 'selector' },
  { key: 'poReference', label: 'Po Reference', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
];

export default function InvoiceForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
