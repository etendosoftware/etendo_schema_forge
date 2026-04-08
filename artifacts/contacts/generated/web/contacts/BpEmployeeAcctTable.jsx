import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpEmployeeAcct
const columns = [

];
// @sf-generated-end columns:bpEmployeeAcct

const filters = [];

// @sf-generated-start component:BpEmployeeAcctTable
export default function BpEmployeeAcctTable(props) {
  // @sf-custom-slot hooks:BpEmployeeAcctTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpEmployeeAcctTable

// @sf-custom-slot section:BpEmployeeAcctTable-custom
