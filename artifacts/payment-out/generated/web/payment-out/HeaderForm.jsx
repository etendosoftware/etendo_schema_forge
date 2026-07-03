import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', label: 'Paying To', section: 'principal', reference: 'BusinessPartner', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'selector', label: 'Paying From', required: true, section: 'principal', reference: 'FinancialAccount', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true && record['status'] !== 'RPAE' },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date', section: 'principal', readOnlyLogic: (record) => record['processed'] === true && record['status'] !== 'RPAE' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'principal', reference: 'PaymentMethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true && record['status'] !== 'RPAE' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'referenceNo', column: 'Referenceno', type: 'text', label: 'Reference No.', section: 'collapsed' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'collapsed' },
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated', labels: {"es_ES":"Coste No Calculado"} }, { value: 'd', label: 'Disabled For Background', labels: {"es_ES":"Deshabilitado Para Background"} }, { value: 'D', label: 'Document Disabled', labels: {"es_ES":"Documento Deshabilitado"} }, { value: 'L', label: 'Document Locked', labels: {"es_ES":"Documento Bloqueado"} }, { value: 'E', label: 'Error', labels: {"es_ES":"Error"} }, { value: 'C', label: 'Error, No cost', labels: {"es_ES":"Error, No hay coste"} }, { value: 'i', label: 'Invalid Account', labels: {"es_ES":"Cuenta No Válida"} }, { value: 'AD', label: 'No Accounting Date', labels: {"es_ES":"Sin Fecha Contable"} }, { value: 'DT', label: 'No Document Type', labels: {"es_ES":"Sin tipo de Documento"} }, { value: 'NO', label: 'No Related PO', labels: {"es_ES":"Sin PO Relacionada"} }, { value: 'b', label: 'Not Balanced', labels: {"es_ES":"No Balanceado"} }, { value: 'c', label: 'Not Convertible (no rate)', labels: {"es_ES":"No Convertible (no hay rango)"} }, { value: 'l', label: 'Pending Refresh', labels: {"es_ES":"Pendiente de Actualización"} }, { value: 'p', label: 'Period Closed', labels: {"es_ES":"Periodo Cerrado"} }, { value: 'y', label: 'Post Prepared', labels: {"es_ES":"Contabilidad Preparada"} }, { value: 'Y', label: 'Posted', labels: {"es_ES":"Contabilizado"} }, { value: 'T', label: 'Table Disabled', labels: {"es_ES":"Tabla Deshabilitada"} }, { value: 'N', label: 'Unposted', labels: {"es_ES":"No Contabilizado"} }], defaultValue: 'N' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
HeaderForm.hasCollapsedFields = true;

// @sf-generated-end component:HeaderForm
