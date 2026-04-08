import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentPlan
const columns = [
  { key: 'dueDate', column: 'Duedate', type: 'date' },
  { key: 'expectedDate', column: 'ExpectedDate', type: 'date' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'string' },
  { key: 'amount', column: 'Amount', type: 'amount' },
  { key: 'paidAmount', column: 'Paidamt', type: 'amount' },
  { key: 'outstandingAmount', column: 'Outstandingamt', type: 'amount' },
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
