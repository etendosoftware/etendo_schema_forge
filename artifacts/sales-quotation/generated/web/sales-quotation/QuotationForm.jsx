import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:quotation
const fields = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Quotation Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', label: 'Price List', required: true, section: 'principal', reference: 'PriceList', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }, readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'validUntil', column: 'validuntil', type: 'date', label: 'Valid Until', section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', section: 'principal', reference: 'Paymentmethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', label: 'Payment Terms', required: true, section: 'principal', reference: 'PaymentTerm', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'rejectReason', column: 'C_Reject_Reason_ID', type: 'selector', label: 'Reject Reason', readOnly: true, section: 'principal', reference: 'Reject_Reason', inputMode: 'selector', displayLogic: (record) => record.documentStatus === 'CJ', readOnlyLogic: (record) => record['documentStatus'] === 'CJ' || record['documentStatus'] === 'CA' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', label: 'Total Gross Amount', required: true, readOnly: true, section: 'summary' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', label: 'Total Net Amount', required: true, readOnly: true, section: 'summary' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'collapsed', readOnlyLogic: (record) => record['processed'] === true },
];
// @sf-generated-end fields:quotation

// @sf-generated-start component:QuotationForm
export default function QuotationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
QuotationForm.hasCollapsedFields = true;

// @sf-generated-end component:QuotationForm
