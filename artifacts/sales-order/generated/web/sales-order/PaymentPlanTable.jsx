import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentPlan
const columns = [
  { key: 'dueDate', column: 'Duedate', type: 'date' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'string' },
  { key: 'expectedAmount', column: 'Expected', type: 'amount' },
  { key: 'received', column: 'Received', type: 'amount' },
  { key: 'outstanding', column: 'Outstanding', type: 'amount' },
  { key: 'numberOfPayments', column: 'Numberofpayments', type: 'number' },
  { key: 'currency', column: 'C_Currency_ID', type: 'string' },
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
