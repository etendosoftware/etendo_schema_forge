import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:goodsReceipt
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'other' },
  // @sf-custom-slot callout:SE_InOut_Warehouse
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'selector' },
  // @sf-custom-slot callout:SL_InOut_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  // @sf-custom-slot callout:SL_InOut_AccountingDate
  { key: 'movementDate', column: 'MovementDate', type: 'date', required: true, section: 'principal' },
  { key: 'accountingDate', column: 'DateAcct', type: 'date', required: true, section: 'other' },
  { key: 'salesOrder', column: 'C_Order_ID', type: 'search', readOnly: true, section: 'other', reference: 'Order', inputMode: 'search' },
  { key: 'orderReference', column: 'POReference', type: 'text', section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  { key: 'project', column: 'C_Project_ID', type: 'search', section: 'other', reference: 'Project', inputMode: 'search' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', section: 'other', reference: 'CostCenter', inputMode: 'selector' },
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', section: 'other', reference: 'Asset', inputMode: 'selector' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', section: 'other', reference: 'UserDimension1', inputMode: 'selector' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', section: 'other', reference: 'UserDimension2', inputMode: 'selector' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'number', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:goodsReceipt

// @sf-generated-start component:GoodsReceiptForm
export default function GoodsReceiptForm(props) {
  // @sf-custom-slot hooks:GoodsReceiptForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:GoodsReceiptForm

// @sf-custom-slot section:GoodsReceiptForm-custom
