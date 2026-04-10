import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:quotation
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Quotation Date', required: true, section: 'principal', defaultValue: '@#Date@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }, readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'validUntil', column: 'validuntil', type: 'date', label: 'Valid Until', section: 'principal' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', section: 'collapsed', reference: 'Paymentmethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', label: 'Total Gross Amount', required: true, readOnly: true, section: 'summary' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', label: 'Total Net Amount', required: true, readOnly: true, section: 'summary' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'collapsed' },
];
// @sf-generated-end fields:quotation

// @sf-generated-start component:QuotationForm
export default function QuotationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:QuotationForm
