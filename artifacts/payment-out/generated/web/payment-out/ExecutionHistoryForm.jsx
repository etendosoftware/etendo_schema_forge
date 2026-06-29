import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:executionHistory
const fields = [
  { key: 'executionDate', column: 'Executiondate', type: 'date', label: 'Execution Date', readOnly: true, section: 'other' },
  { key: 'paymentRun', column: 'FIN_Payment_Run_ID', type: 'search', label: 'Payment Run', readOnly: true, section: 'other', reference: 'Payment_Run', inputMode: 'search' },
  { key: 'paymentRunStatus', column: 'Prun_Status', type: 'select', label: 'Payment Out Run Status', readOnly: true, section: 'other', options: [{ value: 'E', label: 'Executed', labels: {"es_ES":"Ejecutado"} }, { value: 'PE', label: 'Partially Executed', labels: {"es_ES":"Ejecutado Parcialmente"} }, { value: 'P', label: 'Pending', labels: {"es_ES":"Pendiente"} }] },
  { key: 'paymentRunMessage', column: 'Prun_Message', type: 'text', label: 'Payment Out Run Message', readOnly: true, section: 'other' },
  { key: 'sourceOfTheExecution', column: 'Prun_Source', type: 'select', label: 'Source of the Execution', readOnly: true, section: 'other', options: [{ value: 'AIP', label: 'Automatically from Invoice Process', labels: {"es_ES":"Automáticamente desde Procesar Factura"} }, { value: 'APP', label: 'Automatically from Payment Process', labels: {"es_ES":"Automáticamente desde el Proceso de Pago"} }, { value: 'MF', label: 'Execute Payments Form', labels: {"es_ES":"Ejecutar formas de Pago"} }, { value: 'OTHER', label: 'Other Source', labels: {"es_ES":"Otra fuente"} }, { value: 'PPW', label: 'Payment Proposal Window', labels: {"es_ES":"Ventana de Propuesta de Pago"} }, { value: 'PW', label: 'Payments Window', labels: {"es_ES":"Ventana Pagos"} }] },
  { key: 'paymentExecutionResult', column: 'Paymentexec_Result', type: 'select', label: 'Payment Out Execution Result', readOnly: true, section: 'other', options: [{ value: 'E', label: 'Error', labels: {"es_ES":"Error"} }, { value: 'P', label: 'Pending', labels: {"es_ES":"Pendiente"} }, { value: 'S', label: 'Successful', labels: {"es_ES":"Éxito"} }] },
  { key: 'paymentExecutionMessage', column: 'Paymentexec_Message', type: 'text', label: 'Payment Out Execution Message', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:executionHistory

// @sf-generated-start component:ExecutionHistoryForm
export default function ExecutionHistoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ExecutionHistoryForm
