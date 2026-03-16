import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productTransaction
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Product', inputMode: 'search' },
  { key: 'attributeSetInstance', column: 'M_AttributeSetInstance_ID', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', required: true, readOnly: true, section: 'other' },
  { key: 'movementType', column: 'MovementType', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'goodsShipmentLine', column: 'M_InOutLine_ID', type: 'search', readOnly: true, section: 'other', reference: 'GoodsShipmentLine', inputMode: 'search' },
  { key: 'inventoryLine', column: 'M_InventoryLine_ID', type: 'search', readOnly: true, section: 'other', reference: 'InventoryLine', inputMode: 'search' },
  { key: 'movementLine', column: 'M_MovementLine_ID', type: 'search', readOnly: true, section: 'other', reference: 'MovementLine', inputMode: 'search' },
  { key: 'productionLine', column: 'M_ProductionLine_ID', type: 'search', readOnly: true, section: 'other', reference: 'ProductionLine', inputMode: 'search' },
  { key: 'projectIssue', column: 'C_ProjectIssue_ID', type: 'search', readOnly: true, section: 'other', reference: 'ProjectIssue', inputMode: 'search' },
];
// @sf-generated-end fields:productTransaction

// @sf-generated-start component:ProductTransactionForm
export default function ProductTransactionForm(props) {
  // @sf-custom-slot hooks:ProductTransactionForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductTransactionForm

// @sf-custom-slot section:ProductTransactionForm-custom
