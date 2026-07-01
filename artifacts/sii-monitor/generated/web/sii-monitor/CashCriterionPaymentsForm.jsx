import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:cashCriterionPayments
const fields = [
  { key: 'issent', column: 'Issent', type: 'checkbox', label: 'Sent to SII', section: 'principal' },
  { key: 'estado', column: 'Estado', type: 'select', label: 'SII Registration Status', section: 'principal', options: [{ value: 'AE', label: 'Accepted with errors', labels: {"es_ES":"Aceptado con errores"} }, { value: 'AN', label: 'Annulled', labels: {"es_ES":"Anulado"} }, { value: 'IN', label: 'Incorrect', labels: {"es_ES":"Incorrecto"} }, { value: 'NR', label: 'Not Registrable to SII', labels: {"es_ES":"No Declarable en SII"} }, { value: 'PE', label: 'Pending to send to SII', labels: {"es_ES":"Pendiente de enviar a SII"} }, { value: 'CO', label: 'Right', labels: {"es_ES":"Correcto"} }, { value: 'EE', label: 'Sending error', labels: {"es_ES":"Error al enviar"} }, { value: 'BA', label: 'Unsubscribed', labels: {"es_ES":"Baja"} }] },
  { key: 'invoicenumber', column: 'Invoicenumber', type: 'text', label: 'Invoice number', section: 'principal' },
  { key: 'dateinvoiced', column: 'Dateinvoiced', type: 'date', label: 'Invoice Date', section: 'principal' },
  { key: 'isreceipt', column: 'Isreceipt', type: 'checkbox', label: 'Receipt', section: 'other' },
  { key: 'bpartner', column: 'C_Bpartner_ID', type: 'search', label: 'Business Partner', section: 'other', reference: 'BPartner', inputMode: 'search' },
  { key: 'paymentnumber', column: 'Paymentnumber', type: 'text', label: 'Payment Number', section: 'other' },
  { key: 'paymentdate', column: 'Paymentdate', type: 'date', label: 'Payment Date', section: 'other' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Amount', section: 'other' },
  { key: 'status', column: 'Status', type: 'select', label: 'Status', section: 'other', options: [{ value: 'RPAP', label: 'Awaiting Payment', labels: {"es_ES":"A Pagar"} }, { value: 'RPAE', label: 'Awaiting Execution', labels: {"es_ES":"A Ejecutar"} }, { value: 'RPVOID', label: 'Void', labels: {"es_ES":"Anulado"} }, { value: 'PPM', label: 'Payment Made', labels: {"es_ES":"Pagado"} }, { value: 'RPR', label: 'Payment Received', labels: {"es_ES":"Cobrado"} }, { value: 'RDNC', label: 'Deposited not Cleared', labels: {"es_ES":"Cobro depositado"} }, { value: 'PWNC', label: 'Withdrawn not Cleared', labels: {"es_ES":"Pago reintegrado"} }, { value: 'RPPC', label: 'Payment Cleared', labels: {"es_ES":"Conciliado"} }] },
  { key: 'fINPaymentmethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', section: 'other', reference: 'Paymentmethod', inputMode: 'selector' },
  { key: 'fINPayment', column: 'FIN_Payment_ID', type: 'selector', label: 'Payment In', section: 'other', reference: 'Payment', inputMode: 'selector' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'fINPaymentDetail', column: 'FIN_Payment_Detail_ID', type: 'selector', label: 'Payment Details', section: 'other', reference: 'Payment_Detail', inputMode: 'selector' },
  { key: 'issotrx', column: 'Issotrx', type: 'checkbox', label: 'Sales Transaction', section: 'other' },
  { key: 'invoice', column: 'C_Invoice_ID', type: 'selector', label: 'Invoice', section: 'other', reference: 'Invoice', inputMode: 'selector' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', section: 'other' },
];
// @sf-generated-end fields:cashCriterionPayments

// @sf-generated-start component:CashCriterionPaymentsForm
export default function CashCriterionPaymentsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:CashCriterionPaymentsForm
