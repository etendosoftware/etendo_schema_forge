import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentsSiiData
const fields = [
  { key: 'fINPayment', column: 'FIN_Payment_ID', type: 'selector', label: 'Payment In', required: true, readOnly: true, section: 'other', reference: 'Payment', inputMode: 'selector' },
  { key: 'motivo', column: 'Motivo', type: 'text', label: 'SII error reason', section: 'principal' },
  { key: 'estado', column: 'Estado', type: 'select', label: 'SII Registration Status', section: 'principal', options: [{ value: 'AE', label: 'Accepted with errors', labels: {"es_ES":"Aceptado con errores"} }, { value: 'AN', label: 'Annulled', labels: {"es_ES":"Anulado"} }, { value: 'IN', label: 'Incorrect', labels: {"es_ES":"Incorrecto"} }, { value: 'NR', label: 'Not Registrable to SII', labels: {"es_ES":"No Declarable en SII"} }, { value: 'PE', label: 'Pending to send to SII', labels: {"es_ES":"Pendiente de enviar a SII"} }, { value: 'CO', label: 'Right', labels: {"es_ES":"Correcto"} }, { value: 'EE', label: 'Sending error', labels: {"es_ES":"Error al enviar"} }, { value: 'BA', label: 'Unsubscribed', labels: {"es_ES":"Baja"} }] },
  { key: 'aeatsiiConexion', column: 'Aeatsii_Conexion_ID', type: 'selector', label: 'SII Connection', section: 'principal', reference: 'Aeatsii_Conexion', inputMode: 'selector' },
  { key: 'codigoCsv', column: 'Codigo_Csv', type: 'text', label: 'CSV code', section: 'principal' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'other' },
];
// @sf-generated-end fields:paymentsSiiData

// @sf-generated-start component:PaymentsSiiDataForm
export default function PaymentsSiiDataForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:PaymentsSiiDataForm
