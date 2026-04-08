import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'dueDate', column: 'DueDate', type: 'date', label: 'Due Date' },
  { key: 'expected', column: 'ExpectedAmount', type: 'amount', label: 'Expected Amount' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Paid Amount' },
  { key: 'orderNo', column: 'DocumentNo', type: 'string', label: 'Order No.' },
  { key: 'invoiceNo', column: 'DocumentNo', type: 'string', label: 'Invoice No.' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'string', label: 'Business Partner' },
];
// @sf-generated-end columns:lines

const filters = [];

// @sf-generated-start component:LinesTable
export default function LinesTable(props) {
  // @sf-custom-slot hooks:LinesTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:LinesTable

// @sf-custom-slot section:LinesTable-custom
