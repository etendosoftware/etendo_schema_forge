import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:internalConsumptionLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM M_INTERNAL_CONSUMPTIONLINE WHERE M_INTERNAL_CONSUMPTION_ID=@M_INTERNAL_CONSUMPTION_ID@' },
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, lookup: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, section: 'principal', defaultValue: '0' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'search', label: 'Warehouse', required: true, section: 'principal', reference: 'Locator', inputMode: 'search' },
];
// @sf-generated-end fields:internalConsumptionLine

// @sf-generated-start component:InternalConsumptionLineForm
export default function InternalConsumptionLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
InternalConsumptionLineForm.fields = fields;

// @sf-generated-end component:InternalConsumptionLineForm
