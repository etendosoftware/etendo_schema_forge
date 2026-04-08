import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPaymentSchedule
const fields = [
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Due Date', required: true, readOnly: true, section: 'other' },
  { key: 'expectedDate', column: 'ExpectedDate', type: 'date', label: 'Expected Date', required: true, section: 'principal' },
  { key: 'finPaymentmethodID', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, readOnly: true, section: 'other', reference: 'Paymentmethod', inputMode: 'selector' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Expected Amount', required: true, readOnly: true, section: 'other' },
  { key: 'paidAmount', column: 'Paidamt', type: 'number', label: 'Paid Amount', required: true, readOnly: true, section: 'other' },
  { key: 'outstandingAmount', column: 'Outstandingamt', type: 'number', label: 'Outstanding Amount', required: true, readOnly: true, section: 'other' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'lastPaymentDate', column: 'LastPaymentDate', type: 'date', label: 'Last Payment Date', readOnly: true, section: 'other' },
  { key: 'daysOverdue', column: 'daysOverDue', type: 'number', label: 'Days Overdue', readOnly: true, section: 'other' },
  { key: 'numberOfPayments', column: 'NumberOfPayments', type: 'number', label: 'Number of Payments', readOnly: true, section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
];
// @sf-generated-end fields:finPaymentSchedule

// @sf-generated-start component:FinPaymentScheduleForm
export default function FinPaymentScheduleForm(props) {
  // @sf-custom-slot hooks:FinPaymentScheduleForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:FinPaymentScheduleForm

// @sf-custom-slot section:FinPaymentScheduleForm-custom
