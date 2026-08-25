import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:movementLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_MovementLine WHERE M_Movement_ID=@M_Movement_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, lookup: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, section: 'principal', defaultValue: '1', readOnlyLogic: (record) => record['processed'] === true || record['uomManagement'] === 'Y' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', required: true, section: 'principal', reference: 'Locator', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'newStorageBin', column: 'M_LocatorTo_ID', type: 'selector', label: 'New Storage Bin', required: true, section: 'other', reference: 'Locator', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
];
// @sf-generated-end fields:movementLine

// @sf-generated-start component:MovementLineForm
export default function MovementLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
MovementLineForm.fields = fields;

// @sf-generated-end component:MovementLineForm
