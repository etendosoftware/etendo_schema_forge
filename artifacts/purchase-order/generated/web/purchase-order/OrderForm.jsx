import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:order
const fields = [
  // @sf-custom-slot callout:SL_Order_DocType
  { key: 'transactionDocument', column: 'C_DocTypeTarget_ID', type: 'search', required: true, section: 'other', reference: 'DocumentType' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SL_Order_UpdateLinesDate
  { key: 'orderDate', column: 'DateOrdered', type: 'date', required: true, section: 'other' },
  // @sf-custom-slot callout:SE_Order_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  // @sf-custom-slot callout:SE_Order_BPartnerLocation
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', required: true, section: 'other', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'selector' },
  // @sf-custom-slot callout:SL_Order_UpdateLinesDate
  { key: 'scheduledDeliveryDate', column: 'DatePromised', type: 'date', required: true, section: 'principal' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'other', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', required: true, section: 'other', reference: 'PaymentTerm', inputMode: 'selector' },
  // @sf-custom-slot callout:SL_Order_PriceList
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', required: true, section: 'other', reference: 'PriceList', inputMode: 'selector' },
  { key: 'deliveryNotes', column: 'Deliverynotes', type: 'textarea', section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  { key: 'orderReference', column: 'POReference', type: 'text', section: 'other' },
  { key: 'invoiceFrom', column: 'BillTo_ID', type: 'dependent', required: true, section: 'other', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  { key: 'priceIncludesTax', column: 'IsTaxIncluded', type: 'checkbox', readOnly: true, section: 'other' },
  // @sf-custom-slot callout:SE_Order_Project
  { key: 'project', column: 'C_Project_ID', type: 'search', section: 'other', reference: 'Project', inputMode: 'search' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', section: 'other', reference: 'CostCenter', inputMode: 'selector' },
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', section: 'other', reference: 'Asset', inputMode: 'selector' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', section: 'other', reference: 'UserDimension1', inputMode: 'selector' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', section: 'other', reference: 'UserDimension2', inputMode: 'selector' },
];
// @sf-generated-end fields:order

// @sf-generated-start component:OrderForm
export default function OrderForm(props) {
  // @sf-custom-slot hooks:OrderForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:OrderForm

// @sf-custom-slot section:OrderForm-custom
