import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:reservedStock
const fields = [
  { key: 'stockReservation', column: 'M_Reservation_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Reservation', inputMode: 'search' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'search', readOnly: true, section: 'other', reference: 'Locator', inputMode: 'search' },
  { key: 'attributeSetValue', column: 'M_Attributesetinstance_ID', type: 'text', readOnly: true, section: 'other' },
  { key: 'salesOrderLine', column: 'C_Orderline_ID', type: 'search', section: 'principal', reference: 'Orderline', inputMode: 'search' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', section: 'principal', reference: 'BPartner', inputMode: 'search', defaultValue: '@SQL=SELECT C_BPartner_ID AS DefaultValue FROM C_Order WHERE C_Order_ID=@C_Order_ID@' },
  { key: 'quantity', column: 'Quantity', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'released', column: 'ReleasedQty', type: 'text', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:reservedStock

// @sf-generated-start component:ReservedStockForm
export default function ReservedStockForm(props) {
  // @sf-custom-slot hooks:ReservedStockForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ReservedStockForm

// @sf-custom-slot section:ReservedStockForm-custom
