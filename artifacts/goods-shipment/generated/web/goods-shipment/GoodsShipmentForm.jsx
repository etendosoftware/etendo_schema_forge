import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:goodsShipment
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SE_InOut_Warehouse
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search' },
  // @sf-custom-slot callout:SL_InOut_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  { key: 'description', column: 'Description', type: 'textarea', section: 'collapsed' },
  // @sf-custom-slot callout:SL_InOut_AccountingDate
  { key: 'movementDate', column: 'MovementDate', type: 'date', required: true, section: 'principal', defaultValue: '@#Date@' },
];
// @sf-generated-end fields:goodsShipment

// @sf-generated-start component:GoodsShipmentForm
export default function GoodsShipmentForm(props) {
  // @sf-custom-slot hooks:GoodsShipmentForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:GoodsShipmentForm

// @sf-custom-slot section:GoodsShipmentForm-custom
