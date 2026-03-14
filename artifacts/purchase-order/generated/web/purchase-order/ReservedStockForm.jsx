import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:reservedStock
const fields = [
  { key: 'reservation', column: 'M_Reservation_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Reservation' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'search', readOnly: true, section: 'other', reference: 'Locator' },
  { key: 'attributeSetValue', column: 'M_Attributesetinstance_ID', type: 'text', readOnly: true, section: 'other' },
  { key: 'allocated', column: 'IsAllocated', type: 'checkbox', required: true, readOnly: true, section: 'other' },
  { key: 'quantity', column: 'Quantity', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'released', column: 'ReleasedQty', type: 'text', readOnly: true, section: 'other' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', readOnly: true, section: 'other', reference: 'BusinessPartner' },
];
// @sf-generated-end fields:reservedStock

// @sf-generated-start component:ReservedStockForm
export default function ReservedStockForm(props) {
  // @sf-custom-slot hooks:ReservedStockForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ReservedStockForm

// @sf-custom-slot section:ReservedStockForm-custom
