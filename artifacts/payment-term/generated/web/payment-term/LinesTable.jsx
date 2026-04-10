import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'percentageDue', column: 'Percentage', type: 'number', label: 'Percentage Due' },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'string', label: 'Payment Method' },
];
// @sf-generated-end columns:lines

const filters = [];

// @sf-generated-start component:LinesTable
export default function LinesTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:LinesTable
