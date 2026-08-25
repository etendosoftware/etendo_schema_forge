import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:reconciliations
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'endingDate', column: 'Dateto', type: 'date', label: 'Ending Date', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'transactionDate', column: 'Statementdate', type: 'date', label: 'Transaction Date', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'startingbalance', column: 'Startingbalance', type: 'number', label: 'Starting Balance', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'endingBalance', column: 'Endingbalance', type: 'number', label: 'Ending Balance', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'documentStatus', column: 'Docstatus', type: 'select', label: 'Document Status', required: true, readOnly: true, section: 'other', options: [{ value: 'CL', label: 'Closed', labels: {"es_ES":"Cerrado"} }, { value: 'CO', label: 'Completed', labels: {"es_ES":"Completado"} }, { value: 'DR', label: 'Draft', labels: {"es_ES":"Borrador"} }, { value: 'NA', label: 'Not Accepted', labels: {"es_ES":"No aprobado"} }, { value: 'WP', label: 'Not Paid', labels: {"es_ES":"Pendiente de Pago"} }, { value: 'RE', label: 'Re-Opened', labels: {"es_ES":"Reabierto"} }, { value: 'TEMP', label: 'Temporal', labels: {"es_ES":"Temporal"} }, { value: 'IP', label: 'Under Way', labels: {"es_ES":"En curso"} }, { value: '??', label: 'Unknown', labels: {"es_ES":"Desconocido"} }, { value: 'VO', label: 'Voided', labels: {"es_ES":"Anulado"} }] },
];
// @sf-generated-end fields:reconciliations

// @sf-generated-start component:ReconciliationsForm
export default function ReconciliationsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
ReconciliationsForm.fields = fields;

// @sf-generated-end component:ReconciliationsForm
