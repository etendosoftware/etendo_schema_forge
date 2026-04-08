import { DataTable } from '@/components/contract-ui';
import { useNavigate } from 'react-router-dom';

// @sf-generated-start columns:finPaymentScheduleDetail
const columns = [
  { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'string', label: 'Invoice' },
  { key: 'dueDate', column: 'DueDate', type: 'date' },
  { key: 'amount', column: 'Amount', type: 'amount' },
];
// @sf-generated-end columns:finPaymentScheduleDetail

const filters = [];

// @sf-generated-start component:FinPaymentScheduleDetailTable
export default function FinPaymentScheduleDetailTable(props) {
  // @sf-custom-slot hooks:FinPaymentScheduleDetailTable
  const navigate = useNavigate();

  const handleRowClick = (row) => {
    if (row.invoiceId) {
      navigate(`/sales-invoice/${row.invoiceId}`);
    }
  };

  return <DataTable columns={columns} filters={filters} {...props} onRowClick={handleRowClick} />;
}
// @sf-generated-end component:FinPaymentScheduleDetailTable

// @sf-custom-slot section:FinPaymentScheduleDetailTable-custom
