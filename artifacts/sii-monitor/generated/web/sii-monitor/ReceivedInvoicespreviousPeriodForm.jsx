import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:receivedInvoices(previousPeriod)
const fields = [
  { key: 'aeatsiiInvoice', column: 'EM_Aeatsii_Invoice_ID', type: 'selector', label: 'Invoice', section: 'principal', reference: 'Invoice', inputMode: 'selector' },
  { key: 'aeatsiiIssent', column: 'EM_Aeatsii_Issent', type: 'checkbox', label: 'Sent to SII', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => true },
  { key: 'aeatsiiModified', column: 'EM_Aeatsii_Modified', type: 'checkbox', label: 'Modified in SII', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => true },
  { key: 'aeatsiiEstado', column: 'EM_Aeatsii_Estado', type: 'select', label: 'SII Registration Status', readOnly: true, section: 'other', options: [{ value: 'AE', label: 'Accepted with errors', labels: {"es_ES":"Aceptado con errores"} }, { value: 'AN', label: 'Annulled', labels: {"es_ES":"Anulado"} }, { value: 'IN', label: 'Incorrect', labels: {"es_ES":"Incorrecto"} }, { value: 'NR', label: 'Not Registrable to SII', labels: {"es_ES":"No Declarable en SII"} }, { value: 'PE', label: 'Pending to send to SII', labels: {"es_ES":"Pendiente de enviar a SII"} }, { value: 'CO', label: 'Right', labels: {"es_ES":"Correcto"} }, { value: 'EE', label: 'Sending error', labels: {"es_ES":"Error al enviar"} }, { value: 'BA', label: 'Unsubscribed', labels: {"es_ES":"Baja"} }], defaultValue: '@SQL=SELECT CASE WHEN ((SELECT c.insiisystem FROM aeatsii_config c WHERE c.ad_org_id = (SELECT ad_get_org_le_bu(@AD_Org_ID@,\'LE\') FROM dual))=\'Y\') THEN \'PE\' ELSE null END FROM dual', readOnlyLogic: (record) => true },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date', required: true, section: 'principal', readOnlyLogic: (record) => record['posted'] === 'Y' || (record['processed'] === true && (record['documentStatus'] !== 'VO')) },
  { key: 'etsgDateOperation', column: 'EM_Etsg_Date_Operation', type: 'date', label: 'Fecha operación', section: 'principal', defaultValue: '@DateInvoiced@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, section: 'principal', readOnlyLogic: (record) => record['posted'] === 'Y' },
  { key: 'documentStatus', column: 'DocStatus', type: 'select', label: 'Document Status', required: true, readOnly: true, section: 'other', options: [{ value: 'CL', label: 'Closed', labels: {"es_ES":"Cerrado"} }, { value: 'CO', label: 'Completed', labels: {"es_ES":"Completado"} }, { value: 'DR', label: 'Draft', labels: {"es_ES":"Borrador"} }, { value: 'NA', label: 'Not Accepted', labels: {"es_ES":"No aprobado"} }, { value: 'WP', label: 'Not Paid', labels: {"es_ES":"Pendiente de Pago"} }, { value: 'RE', label: 'Re-Opened', labels: {"es_ES":"Reabierto"} }, { value: 'TEMP', label: 'Temporal', labels: {"es_ES":"Temporal"} }, { value: 'IP', label: 'Under Way', labels: {"es_ES":"En curso"} }, { value: '??', label: 'Unknown', labels: {"es_ES":"Desconocido"} }, { value: 'VO', label: 'Voided', labels: {"es_ES":"Anulado"} }], defaultValue: 'DR' },
  { key: 'orderReference', column: 'POReference', type: 'text', label: 'Order Reference', section: 'other' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'other', reference: 'BPartner', inputMode: 'search', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', label: 'Total Gross Amount', required: true, readOnly: true, section: 'other' },
  { key: 'aeatsiiClaveTipo', column: 'EM_Aeatsii_Clave_Tipo', type: 'select', label: 'Invoice type key', section: 'other', options: [{ value: 'R', label: 'Corrective invoice', labels: {"es_ES":"Factura rectificativa"} }, { value: 'F1', label: 'Invoice', labels: {"es_ES":"Factura"} }, { value: 'F2', label: 'Simplified invoice', labels: {"es_ES":"Factura simplificada"} }, { value: 'F4', label: 'Simplified invoices summary', labels: {"es_ES":"Asiento resumen facturas simplificadas"} }], defaultValue: '@SQL=SELECT CASE WHEN ((SELECT c.insiisystem FROM aeatsii_config c WHERE c.ad_org_id = (SELECT ad_get_org_le_bu(@AD_Org_ID@,\'LE\') FROM dual))=\'Y\') THEN \'F1\' ELSE null END FROM dual', readOnlyLogic: (record) => (record['em_aeatsii_estado'] === 'CO' || record['em_aeatsii_estado'] === 'AE' || record['documentStatus'] === 'VO') && record['processed'] === true },
  { key: 'totalPaid', column: 'Totalpaid', type: 'number', label: 'Total Paid', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'other', reference: 'Paymentmethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'salesTransaction', column: 'IsSOTrx', type: 'checkbox', label: 'Sales Transaction', required: true, readOnly: true, section: 'other', defaultValue: '@IsSOTrx@' },
  { key: 'aeatsiiErrorRegistral', column: 'EM_Aeatsii_Error_Registral', type: 'checkbox', label: 'Register Error Modified', required: true, section: 'other', readOnlyLogic: (record) => (record['em_aeatsii_estado'] !== 'CO' && record['em_aeatsii_estado'] !== 'AE') || record['em_aeatsii_modified'] === 'Y' || record['documentStatus'] === 'VO' },
  { key: 'aeatsiiErrorCode', column: 'EM_Aeatsii_Error_Code', type: 'text', label: 'SII error code', section: 'other', readOnlyLogic: (record) => true },
  { key: 'aeatsiiErrorMsg', column: 'EM_Aeatsii_Error_Msg', type: 'text', label: 'SII error message', section: 'other', readOnlyLogic: (record) => true },
  { key: 'aeatsiiInsiidate', column: 'EM_Aeatsii_Insiidate', type: 'date', label: 'SII registry date', section: 'other', readOnlyLogic: (record) => true },
];
// @sf-generated-end fields:receivedInvoices(previousPeriod)

// @sf-generated-start component:ReceivedInvoicespreviousPeriodForm
export default function ReceivedInvoicespreviousPeriodForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ReceivedInvoicespreviousPeriodForm
