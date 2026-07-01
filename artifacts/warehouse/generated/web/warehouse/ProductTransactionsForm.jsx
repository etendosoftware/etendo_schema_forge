import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productTransactions
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, readOnly: true, section: 'other', reference: 'Product', inputMode: 'search' },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', label: 'Attribute Set Value', required: true, readOnly: true, section: 'other' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, readOnly: true, section: 'other' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, readOnly: true, section: 'other' },
  { key: 'movementType', column: 'MovementType', type: 'select', label: 'Movement Type', required: true, readOnly: true, section: 'other', options: [{ value: 'V+', label: 'Vendor Receipts', labels: {"es_ES":"Albarán proveedor"} }, { value: 'I+', label: 'Inventory In', labels: {"es_ES":"Entrada inventario"} }, { value: 'M-', label: 'Movement From', labels: {"es_ES":"Mover desde"} }, { value: 'M+', label: 'Movement To', labels: {"es_ES":"Mover a"} }, { value: 'I-', label: 'Inventory Out', labels: {"es_ES":"Salida inventario"} }, { value: 'P-', label: 'Production -', labels: {"es_ES":"Producción -"} }, { value: 'P+', label: 'Production +', labels: {"es_ES":"Producción +"} }, { value: 'C-', label: 'Customer Shipment', labels: {"es_ES":"Albarán cliente"} }, { value: 'D-', label: 'Internal Consumption -', labels: {"es_ES":"Consumo Interno -"} }, { value: 'D+', label: 'Internal Consumption +', labels: {"es_ES":"Consumo Interno +"} }] },
  { key: 'goodsShipmentLine', column: 'M_InOutLine_ID', type: 'search', label: 'Goods Shipment Line', readOnly: true, section: 'other', reference: 'InOutLine', inputMode: 'search' },
  { key: 'physicalInventoryLine', column: 'M_InventoryLine_ID', type: 'search', label: 'Physical Inventory Line', readOnly: true, section: 'other', reference: 'InventoryLine', inputMode: 'search' },
  { key: 'movementLine', column: 'M_MovementLine_ID', type: 'search', label: 'Movement Line', readOnly: true, section: 'other', reference: 'MovementLine', inputMode: 'search' },
  { key: 'productionLine', column: 'M_ProductionLine_ID', type: 'search', label: 'Production Line', readOnly: true, section: 'other', reference: 'ProductionLine', inputMode: 'search' },
  { key: 'projectIssue', column: 'C_ProjectIssue_ID', type: 'search', label: 'Project Issue', readOnly: true, section: 'other', reference: 'ProjectIssue', inputMode: 'search' },
];
// @sf-generated-end fields:productTransactions

// @sf-generated-start component:ProductTransactionsForm
export default function ProductTransactionsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ProductTransactionsForm
