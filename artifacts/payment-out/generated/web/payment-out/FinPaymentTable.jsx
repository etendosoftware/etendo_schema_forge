import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:finPayment
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'string', label: 'Paying To' },
  { key: 'amount', column: 'Amount', type: 'amount', label: 'Amount' },
  { key: 'status', column: 'Status', type: 'status', label: 'Status' },
];
// @sf-generated-end columns:finPayment

const filters = ['documentNo', 'referenceNo', 'paymentDate', 'businessPartner', 'status'];

// @sf-generated-start component:FinPaymentTable
export default function FinPaymentTable(props) {
  // @sf-custom-slot hooks:FinPaymentTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:FinPaymentTable

// @sf-custom-slot section:FinPaymentTable-custom
