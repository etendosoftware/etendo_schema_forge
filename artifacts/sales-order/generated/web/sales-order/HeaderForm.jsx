import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SL_Order_UpdateLinesDate
  { key: 'orderDate', column: 'DateOrdered', type: 'date', required: true, section: 'principal', defaultValue: '@#Date@' },
  // @sf-custom-slot callout:SE_Order_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  // @sf-custom-slot callout:SE_Order_BPartnerLocation
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'collapsed', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', required: true, section: 'collapsed', reference: 'Warehouse', inputMode: 'search' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', required: true, readOnly: true, section: 'summary' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', required: true, readOnly: true, section: 'summary' },
  { key: 'orderReference', column: 'POReference', type: 'text', section: 'collapsed' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'collapsed' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  // @sf-custom-slot hooks:HeaderForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:HeaderForm

// @sf-custom-slot section:HeaderForm-custom
