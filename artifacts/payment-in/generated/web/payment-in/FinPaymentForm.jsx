import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPayment
const fields = [
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated', labels: {"es_ES":"Coste No Calculado"} }, { value: 'd', label: 'Disabled For Background', labels: {"es_ES":"Deshabilitado Para Background"} }, { value: 'D', label: 'Document Disabled', labels: {"es_ES":"Documento Deshabilitado"} }, { value: 'L', label: 'Document Locked', labels: {"es_ES":"Documento Bloqueado"} }, { value: 'E', label: 'Error', labels: {"es_ES":"Error"} }, { value: 'C', label: 'Error, No cost', labels: {"es_ES":"Error, No hay coste"} }, { value: 'i', label: 'Invalid Account', labels: {"es_ES":"Cuenta No Válida"} }, { value: 'AD', label: 'No Accounting Date', labels: {"es_ES":"Sin Fecha Contable"} }, { value: 'DT', label: 'No Document Type', labels: {"es_ES":"Sin tipo de Documento"} }, { value: 'NO', label: 'No Related PO', labels: {"es_ES":"Sin PO Relacionada"} }, { value: 'b', label: 'Not Balanced', labels: {"es_ES":"No Balanceado"} }, { value: 'c', label: 'Not Convertible (no rate)', labels: {"es_ES":"No Convertible (no hay rango)"} }, { value: 'l', label: 'Pending Refresh', labels: {"es_ES":"Pendiente de Actualización"} }, { value: 'p', label: 'Period Closed', labels: {"es_ES":"Periodo Cerrado"} }, { value: 'y', label: 'Post Prepared', labels: {"es_ES":"Contabilidad Preparada"} }, { value: 'Y', label: 'Posted', labels: {"es_ES":"Contabilizado"} }, { value: 'T', label: 'Table Disabled', labels: {"es_ES":"Tabla Deshabilitada"} }, { value: 'N', label: 'Unposted', labels: {"es_ES":"No Contabilizado"} }], defaultValue: 'N' },
];
// @sf-generated-end fields:finPayment

// @sf-generated-start component:FinPaymentForm
export default function FinPaymentForm(props) {
  return <EntityForm fields={fields} cols={3} {...props} />;
}

// @sf-generated-end component:FinPaymentForm
