import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:quotation
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SL_Order_UpdateLinesDate
  { key: 'orderDate', column: 'DateOrdered', type: 'date', required: true, section: 'principal', defaultValue: '@#Date@' },
  // @sf-custom-slot callout:SE_Order_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  // @sf-custom-slot callout:SE_Order_BPartnerLocation
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', required: true, section: 'collapsed', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  { key: 'validUntil', column: 'validuntil', type: 'date', section: 'principal' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'collapsed', reference: 'Paymentmethod', inputMode: 'selector' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', required: true, readOnly: true, section: 'summary' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', required: true, readOnly: true, section: 'summary' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'collapsed' },
];
// @sf-generated-end fields:quotation

// @sf-generated-start component:QuotationForm
export default function QuotationForm(props) {
  // @sf-custom-slot hooks:QuotationForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:QuotationForm

// @sf-custom-slot section:QuotationForm-custom
