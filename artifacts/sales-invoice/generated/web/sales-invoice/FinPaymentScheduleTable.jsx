import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:finPaymentSchedule
const columns = [
  { key: 'dueDate', column: 'Duedate', type: 'date' },
  { key: 'lastPaymentDate', column: 'LastPaymentDate', type: 'date' },
];
// @sf-generated-end columns:finPaymentSchedule

const filters = [];

// @sf-generated-start component:FinPaymentScheduleTable
export default function FinPaymentScheduleTable(props) {
  // @sf-custom-slot hooks:FinPaymentScheduleTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:FinPaymentScheduleTable

// @sf-custom-slot section:FinPaymentScheduleTable-custom
