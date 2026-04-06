import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:customerAccounting
const columns = [

];
// @sf-generated-end columns:customerAccounting

const filters = [];

// @sf-generated-start component:CustomerAccountingTable
export default function CustomerAccountingTable(props) {
  // @sf-custom-slot hooks:CustomerAccountingTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:CustomerAccountingTable

// @sf-custom-slot section:CustomerAccountingTable-custom
