import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:inventoryLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_InventoryLine WHERE M_Inventory_ID=@M_Inventory_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, lookup: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'quantityOrderBook', column: 'QuantityOrderBook', type: 'number', label: 'Quantity order book', readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'quantityCount', column: 'QtyCount', type: 'number', label: 'User Count', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'bookQuantity', column: 'QtyBook', type: 'number', label: 'System Count', required: true, readOnly: true, section: 'other' },
  { key: 'cost', column: 'Cost', type: 'number', label: 'Cost', section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'etgoQtydiff', column: 'EM_Etgo_Qtydiff', type: 'number', label: 'Difference', readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:inventoryLine

// @sf-generated-start component:InventoryLineForm
export default function InventoryLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:InventoryLineForm
