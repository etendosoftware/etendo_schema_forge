import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productTransactions
const columns = [

];
// @sf-generated-end columns:productTransactions

const filters = [];

// @sf-generated-start component:ProductTransactionsTable
export default function ProductTransactionsTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductTransactionsTable
