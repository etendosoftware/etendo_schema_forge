import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentIn
const columns = [
  { key: 'paymentDate', column: 'Paymentdate', type: 'date' },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'string' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'string' },
  { key: 'amount', column: 'Amount', type: 'amount' },
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'string' },
  { key: 'status', column: 'Status', type: 'status', display: 'dot' },
];
// @sf-generated-end columns:paymentIn

const filters = ['referenceNo', 'paymentDate', 'businessPartner', 'account', 'status'];

// @sf-generated-start component:PaymentInTable
export default function PaymentInTable(props) {
  // @sf-custom-slot hooks:PaymentInTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PaymentInTable

// @sf-custom-slot section:PaymentInTable-custom
