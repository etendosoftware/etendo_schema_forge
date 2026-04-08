import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:usedCreditSource
const columns = [
  { key: 'creditPaymentUsed', column: 'FIN_Payment_Id_Used', type: 'string', label: 'Credit Payment Used' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Amount' },
  { key: 'currency', column: 'C_Currency_ID', type: 'string', label: 'Currency' },
];
// @sf-generated-end columns:usedCreditSource

const filters = [];

// @sf-generated-start component:UsedCreditSourceTable
export default function UsedCreditSourceTable(props) {
  // @sf-custom-slot hooks:UsedCreditSourceTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:UsedCreditSourceTable

// @sf-custom-slot section:UsedCreditSourceTable-custom
