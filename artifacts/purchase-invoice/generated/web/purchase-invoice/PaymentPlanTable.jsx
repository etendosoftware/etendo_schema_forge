import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentPlan
const columns = [
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Due Date' },
  { key: 'expectedDate', column: 'ExpectedDate', type: 'date', label: 'Expected Date' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'string', label: 'Payment Method' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Expected Amount' },
  { key: 'paidAmount', column: 'Paidamt', type: 'amount', label: 'Paid Amount' },
  { key: 'outstandingAmount', column: 'Outstandingamt', type: 'amount', label: 'Outstanding Amount' },
];
// @sf-generated-end columns:paymentPlan

const filters = [];

// @sf-generated-start component:PaymentPlanTable
export default function PaymentPlanTable(props) {
  // @sf-custom-slot hooks:PaymentPlanTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PaymentPlanTable

// @sf-custom-slot section:PaymentPlanTable-custom
