import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:transaction
const fields = [
  { key: 'organization', column: 'AD_Org_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'Organization', inputMode: 'selector', defaultValue: '@AD_Org_ID@' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'StorageBin', inputMode: 'selector' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', required: true, readOnly: true, section: 'other' },
  { key: 'movementType', column: 'MovementType', type: 'select', required: true, readOnly: true, section: 'other', options: [{ value: 'V+', label: 'Vendor Receipts' }, { value: 'I+', label: 'Inventory In' }, { value: 'M-', label: 'Movement From' }, { value: 'M+', label: 'Movement To' }, { value: 'I-', label: 'Inventory Out' }, { value: 'P-', label: 'Production -' }, { value: 'P+', label: 'Production +' }, { value: 'C-', label: 'Customer Shipment' }, { value: 'D-', label: 'Internal Consumption -' }, { value: 'D+', label: 'Internal Consumption +' }] },
  { key: 'totalCost', column: 'TotalCost', type: 'number', readOnly: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
];
// @sf-generated-end fields:transaction

// @sf-generated-start component:TransactionForm
export default function TransactionForm(props) {
  // @sf-custom-slot hooks:TransactionForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:TransactionForm

// @sf-custom-slot section:TransactionForm-custom
