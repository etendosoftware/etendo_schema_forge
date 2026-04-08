import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:factAcct
const columns = [

];
// @sf-generated-end columns:factAcct

const filters = [];

// @sf-generated-start component:FactAcctTable
export default function FactAcctTable(props) {
  // @sf-custom-slot hooks:FactAcctTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:FactAcctTable

// @sf-custom-slot section:FactAcctTable-custom
