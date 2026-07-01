import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentPlan
const fields = [
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Due Date', required: true, readOnly: true, section: 'other' },
  { key: 'expectedDate', column: 'ExpectedDate', type: 'date', label: 'Expected Date', required: true, section: 'principal' },
  { key: 'finPaymentmethodID', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, readOnly: true, section: 'other', reference: 'Paymentmethod', inputMode: 'selector' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Expected Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'paidAmount', column: 'Paidamt', type: 'number', label: 'Received Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'outstandingAmount', column: 'Outstandingamt', type: 'number', label: 'Outstanding Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'lastPaymentDate', column: 'LastPaymentDate', type: 'date', label: 'Last Payment Date', readOnly: true, section: 'other' },
  { key: 'daysOverdue', column: 'daysOverDue', type: 'number', label: 'Days Overdue', readOnly: true, section: 'other' },
  { key: 'numberOfPayments', column: 'NumberOfPayments', type: 'number', label: 'Number of Payments', readOnly: true, section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'totalDebtAmount', column: 'TotalDebtAmount', type: 'number', label: 'Doubtful Debt Amount', readOnly: true, section: 'other', defaultValue: '0' },
  { key: 'finPaymentScheduleID', column: 'Fin_Payment_Schedule_ID', type: 'text', label: 'Fin_Payment_Schedule_ID', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:paymentPlan

// @sf-generated-start component:PaymentPlanForm
export default function PaymentPlanForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:PaymentPlanForm
