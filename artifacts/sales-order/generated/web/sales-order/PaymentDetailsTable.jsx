import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentDetails
const columns = [
  { key: 'paymentDate', column: 'Paymentdate', type: 'date' },
  { key: 'dueDate', column: 'Duedate', type: 'date' },
  { key: 'expectedAmount', column: 'Expected', type: 'amount' },
  { key: 'status', column: 'Status', type: 'status', display: 'dot' },
];
// @sf-generated-end columns:paymentDetails

const filters = [];

// @sf-generated-start component:PaymentDetailsTable
export default function PaymentDetailsTable(props) {
  // @sf-custom-slot hooks:PaymentDetailsTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PaymentDetailsTable

// @sf-custom-slot section:PaymentDetailsTable-custom
