import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentPlan
const columns = [
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Due Date' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'string', label: 'Payment Method' },
  { key: 'expected', column: 'Expected', type: 'amount', label: 'Expected Amount' },
  { key: 'received', column: 'Received', type: 'amount', label: 'Paid' },
  { key: 'outstanding', column: 'Outstanding', type: 'amount', label: 'Outstanding' },
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
