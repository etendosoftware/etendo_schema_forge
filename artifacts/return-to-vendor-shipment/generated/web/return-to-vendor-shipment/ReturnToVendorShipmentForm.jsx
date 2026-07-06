import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:returnToVendorShipment
const fields = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'search', label: 'Warehouse', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }, readOnlyLogic: (record) => record['processed'] === true },
  { key: 'sourceReceiptDocNo', column: 'sourceReceiptDocNo', type: 'text', label: 'Source Receipt', readOnly: true, section: 'principal' },
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated', labels: {"es_ES":"Coste No Calculado"} }, { value: 'd', label: 'Disabled For Background', labels: {"es_ES":"Deshabilitado Para Background"} }, { value: 'D', label: 'Document Disabled', labels: {"es_ES":"Documento Deshabilitado"} }, { value: 'L', label: 'Document Locked', labels: {"es_ES":"Documento Bloqueado"} }, { value: 'E', label: 'Error', labels: {"es_ES":"Error"} }, { value: 'C', label: 'Error, No cost', labels: {"es_ES":"Error, No hay coste"} }, { value: 'i', label: 'Invalid Account', labels: {"es_ES":"Cuenta No Válida"} }, { value: 'AD', label: 'No Accounting Date', labels: {"es_ES":"Sin Fecha Contable"} }, { value: 'DT', label: 'No Document Type', labels: {"es_ES":"Sin tipo de Documento"} }, { value: 'NO', label: 'No Related PO', labels: {"es_ES":"Sin PO Relacionada"} }, { value: 'b', label: 'Not Balanced', labels: {"es_ES":"No Balanceado"} }, { value: 'c', label: 'Not Convertible (no rate)', labels: {"es_ES":"No Convertible (no hay rango)"} }, { value: 'l', label: 'Pending Refresh', labels: {"es_ES":"Pendiente de Actualización"} }, { value: 'p', label: 'Period Closed', labels: {"es_ES":"Periodo Cerrado"} }, { value: 'y', label: 'Post Prepared', labels: {"es_ES":"Contabilidad Preparada"} }, { value: 'Y', label: 'Posted', labels: {"es_ES":"Contabilizado"} }, { value: 'T', label: 'Table Disabled', labels: {"es_ES":"Tabla Deshabilitada"} }, { value: 'N', label: 'Unposted', labels: {"es_ES":"No Contabilizado"} }], defaultValue: 'N' },
];
// @sf-generated-end fields:returnToVendorShipment

// @sf-generated-start component:ReturnToVendorShipmentForm
export default function ReturnToVendorShipmentForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ReturnToVendorShipmentForm
