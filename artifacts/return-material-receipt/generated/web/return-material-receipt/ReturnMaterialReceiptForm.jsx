import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:returnMaterialReceipt
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SL_InOut_AccountingDate
  { key: 'movementDate', column: 'MovementDate', type: 'date', required: true, section: 'principal' },
  // @sf-custom-slot callout:SL_InOut_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  // @sf-custom-slot callout:SE_InOut_Warehouse
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search' },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', required: true, section: 'other', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  { key: 'salesOrder', column: 'C_Order_ID', type: 'search', readOnly: true, section: 'principal', reference: 'Order', inputMode: 'search' },
  { key: 'trackingNo', column: 'TrackingNo', type: 'text', section: 'other' },
];
// @sf-generated-end fields:returnMaterialReceipt

// @sf-generated-start component:ReturnMaterialReceiptForm
export default function ReturnMaterialReceiptForm(props) {
  // @sf-custom-slot hooks:ReturnMaterialReceiptForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ReturnMaterialReceiptForm

// @sf-custom-slot section:ReturnMaterialReceiptForm-custom
