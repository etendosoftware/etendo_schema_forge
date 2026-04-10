import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:paymentMethod
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'active', column: 'Isactive', type: 'boolean', label: 'Active' },
  { key: 'payinAllow', column: 'Payin_Allow', type: 'boolean', label: 'Payment In Allowed' },
  { key: 'payoutAllow', column: 'Payout_Allow', type: 'boolean', label: 'Payment Out Allowed' },
];
// @sf-generated-end columns:paymentMethod

const filters = ['name'];

// @sf-generated-start component:PaymentMethodTable
export default function PaymentMethodTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PaymentMethodTable
