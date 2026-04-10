import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:transactions
const fields = [
  { key: 'organization', column: 'AD_Org_ID', type: 'selector', label: 'Organization', required: true, readOnly: true, section: 'other', reference: 'Organization', inputMode: 'selector', defaultValue: '@AD_Org_ID@' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', required: true, readOnly: true, section: 'other', reference: 'StorageBin', inputMode: 'selector' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, readOnly: true, section: 'other' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, readOnly: true, section: 'other' },
  { key: 'movementType', column: 'MovementType', type: 'select', label: 'Movement Type', required: true, readOnly: true, section: 'other', options: [{ value: 'V+', label: 'Vendor Receipts' }, { value: 'I+', label: 'Inventory In' }, { value: 'M-', label: 'Movement From' }, { value: 'M+', label: 'Movement To' }, { value: 'I-', label: 'Inventory Out' }, { value: 'P-', label: 'Production -' }, { value: 'P+', label: 'Production +' }, { value: 'C-', label: 'Customer Shipment' }, { value: 'D-', label: 'Internal Consumption -' }, { value: 'D+', label: 'Internal Consumption +' }] },
  { key: 'totalCost', column: 'TotalCost', type: 'number', label: 'Total Cost', readOnly: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'C_UOM_ID', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
];
// @sf-generated-end fields:transactions

// @sf-generated-start component:TransactionsForm
export default function TransactionsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:TransactionsForm
