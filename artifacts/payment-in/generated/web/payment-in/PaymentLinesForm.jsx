import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentLines
const fields = [
  { key: 'dueDate', column: 'DueDate', type: 'date', label: 'Due Date', readOnly: true, section: 'principal' },
  { key: 'invoiceAmount', column: 'InvoiceAmount', type: 'number', label: 'Invoice Amount', readOnly: true, section: 'principal' },
  { key: 'expected', column: 'ExpectedAmount', type: 'number', label: 'Expected Amount', readOnly: true, section: 'principal' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Received Amount', required: true, section: 'principal' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'number', label: 'Write-off Amount', readOnly: true, section: 'principal' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', label: 'Business Partner', readOnly: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'canceled', column: 'Iscanceled', type: 'checkbox', label: 'Canceled', readOnly: true, section: 'principal', inputMode: 'checkbox' },
  { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', label: 'Invoice Payment Schedule', section: 'other', reference: 'Invoice', inputMode: 'search' },
  { key: 'orderPaymentSchedule', column: 'FIN_Payment_Schedule_Order', type: 'search', label: 'Order Payment Schedule', section: 'other', reference: 'SalesOrder', inputMode: 'search' },
  { key: 'gLItem', column: 'C_Glitem_ID', type: 'selector', label: 'G/L Item', section: 'other', reference: 'GLItem', inputMode: 'selector' },
];
// @sf-generated-end fields:paymentLines

// @sf-generated-start component:PaymentLinesForm
export default function PaymentLinesForm(props) {
  // @sf-custom-slot hooks:PaymentLinesForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PaymentLinesForm

// @sf-custom-slot section:PaymentLinesForm-custom
