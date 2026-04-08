import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:reservedStock
const fields = [
  { key: 'reservation', column: 'M_Reservation_ID', type: 'search', label: 'Stock Reservation', required: true, readOnly: true, section: 'other', reference: 'Reservation' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Customer', readOnly: true, section: 'other', reference: 'BusinessPartner', defaultValue: '@SQL=SELECT C_BPartner_ID AS DefaultValue FROM C_Order WHERE C_Order_ID=@C_Order_ID@' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'search', label: 'Storage Bin', readOnly: true, section: 'other', reference: 'Locator' },
  { key: 'attributeSetValue', column: 'M_Attributesetinstance_ID', type: 'text', label: 'Attribute Set Value', readOnly: true, section: 'other' },
  { key: 'allocated', column: 'IsAllocated', type: 'checkbox', label: 'Allocated', required: true, readOnly: true, section: 'other', defaultValue: 'N' },
  { key: 'quantity', column: 'Quantity', type: 'number', label: 'Quantity', required: true, readOnly: true, section: 'other' },
  { key: 'released', column: 'ReleasedQty', type: 'number', label: 'Released', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:reservedStock

// @sf-generated-start component:ReservedStockForm
export default function ReservedStockForm(props) {
  // @sf-custom-slot hooks:ReservedStockForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ReservedStockForm

// @sf-custom-slot section:ReservedStockForm-custom
