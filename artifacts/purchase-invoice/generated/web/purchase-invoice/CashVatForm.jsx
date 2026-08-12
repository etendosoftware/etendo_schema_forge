import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:cashVat
const fields = [
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date', section: 'principal' },
  { key: 'percentage', column: 'Percentage', type: 'number', label: 'Percentage', section: 'principal' },
  { key: 'taxAmount', column: 'Taxamt', type: 'number', label: 'Tax Amount', section: 'principal' },
  { key: 'taxableAmount', column: 'Taxbaseamt', type: 'number', label: 'Taxable Amount', section: 'principal' },
  { key: 'canceled', column: 'Iscanceled', type: 'checkbox', label: 'Canceled', section: 'other' },
  { key: 'payment', column: 'FIN_Payment_ID', type: 'selector', label: 'Payment', section: 'other', reference: 'Payment', inputMode: 'selector' },
  { key: 'status', column: 'Status', type: 'select', label: 'Status', section: 'other', options: [{ value: 'RPAP', label: 'Awaiting Payment', labels: {"es_ES":"A Pagar"} }, { value: 'RPAE', label: 'Awaiting Execution', labels: {"es_ES":"A Ejecutar"} }, { value: 'RPVOID', label: 'Void', labels: {"es_ES":"Anulado"} }, { value: 'PPM', label: 'Payment Made', labels: {"es_ES":"Pagado"} }, { value: 'RPR', label: 'Payment Received', labels: {"es_ES":"Cobrado"} }, { value: 'RDNC', label: 'Deposited not Cleared', labels: {"es_ES":"Cobro depositado"} }, { value: 'PWNC', label: 'Withdrawn not Cleared', labels: {"es_ES":"Pago reintegrado"} }, { value: 'RPPC', label: 'Payment Cleared', labels: {"es_ES":"Conciliado"} }] },
  { key: 'isManualSettlement', column: 'IsManualSettlement', type: 'checkbox', label: 'Manual Settlement', required: true, readOnly: true, section: 'other' },
  { key: 'accountingDate', column: 'Dateacct', type: 'date', label: 'Manual Cash VAT Settlement Date', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:cashVat

// @sf-generated-start component:CashVatForm
export default function CashVatForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:CashVatForm
