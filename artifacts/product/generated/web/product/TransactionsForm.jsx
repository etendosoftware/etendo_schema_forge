import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:transactions
const fields = [
  { key: 'organization', column: 'AD_Org_ID', type: 'selector', label: 'Organization', required: true, readOnly: true, section: 'other', reference: 'Organization', inputMode: 'selector', defaultValue: '@AD_Org_ID@' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', required: true, readOnly: true, section: 'other', reference: 'StorageBin', inputMode: 'selector' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, readOnly: true, section: 'other' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, readOnly: true, section: 'other' },
  { key: 'movementType', column: 'MovementType', type: 'select', label: 'Movement Type', required: true, readOnly: true, section: 'other', options: [{ value: 'V+', label: 'Vendor Receipts', labels: {"es_ES":"Albarán proveedor"} }, { value: 'I+', label: 'Inventory In', labels: {"es_ES":"Entrada inventario"} }, { value: 'M-', label: 'Movement From', labels: {"es_ES":"Mover desde"} }, { value: 'M+', label: 'Movement To', labels: {"es_ES":"Mover a"} }, { value: 'I-', label: 'Inventory Out', labels: {"es_ES":"Salida inventario"} }, { value: 'P-', label: 'Production -', labels: {"es_ES":"Producción -"} }, { value: 'P+', label: 'Production +', labels: {"es_ES":"Producción +"} }, { value: 'C-', label: 'Customer Shipment', labels: {"es_ES":"Albarán cliente"} }, { value: 'D-', label: 'Internal Consumption -', labels: {"es_ES":"Consumo Interno -"} }, { value: 'D+', label: 'Internal Consumption +', labels: {"es_ES":"Consumo Interno +"} }] },
  { key: 'totalCost', column: 'TotalCost', type: 'number', label: 'Total Cost', readOnly: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'C_UOM_ID', required: true, readOnly: true, section: 'other', reference: 'UOM', inputMode: 'selector' },
];
// @sf-generated-end fields:transactions

// @sf-generated-start component:TransactionsForm
export default function TransactionsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:TransactionsForm
