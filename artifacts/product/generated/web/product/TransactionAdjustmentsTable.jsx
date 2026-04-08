import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:transactionAdjustments
const columns = [

];
// @sf-generated-end columns:transactionAdjustments

const filters = [];

// @sf-generated-start component:TransactionAdjustmentsTable
export default function TransactionAdjustmentsTable(props) {
  // @sf-custom-slot hooks:TransactionAdjustmentsTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:TransactionAdjustmentsTable

// @sf-custom-slot section:TransactionAdjustmentsTable-custom
