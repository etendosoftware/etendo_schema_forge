import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:finPaymentScheduleDetail
const columns = [
  { key: 'dueDate', column: 'DueDate', type: 'date', label: 'Due Date' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Received Amount' },
  { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'string', label: 'Invoice Payment Schedule' },
];
// @sf-generated-end columns:finPaymentScheduleDetail

const filters = [];

// @sf-generated-start component:FinPaymentScheduleDetailTable
export default function FinPaymentScheduleDetailTable(props) {
  // @sf-custom-slot hooks:FinPaymentScheduleDetailTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:FinPaymentScheduleDetailTable

// @sf-custom-slot section:FinPaymentScheduleDetailTable-custom
