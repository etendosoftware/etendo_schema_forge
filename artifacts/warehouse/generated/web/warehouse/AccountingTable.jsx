import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:accounting
const columns = [

];
// @sf-generated-end columns:accounting

const filters = [];

// @sf-generated-start component:AccountingTable
export default function AccountingTable(props) {
  // @sf-custom-slot hooks:AccountingTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:AccountingTable

// @sf-custom-slot section:AccountingTable-custom
