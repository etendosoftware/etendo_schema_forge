import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }, readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'scheduledDeliveryDate', column: 'DatePromised', type: 'date', label: 'Scheduled Delivery Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', section: 'principal', reference: 'PaymentMethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', label: 'Payment Terms', required: true, section: 'principal', reference: 'PaymentTerm', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', label: 'Price List', required: true, section: 'principal', reference: 'PriceList', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true || record['documentStatus'] === 'TMP' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', label: 'Total Gross Amount', required: true, readOnly: true, section: 'summary' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', label: 'Total Net Amount', required: true, readOnly: true, section: 'summary' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:HeaderForm
