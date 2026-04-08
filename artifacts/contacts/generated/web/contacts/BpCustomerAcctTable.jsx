import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpCustomerAcct
const columns = [

];
// @sf-generated-end columns:bpCustomerAcct

const filters = [];

// @sf-generated-start component:BpCustomerAcctTable
export default function BpCustomerAcctTable(props) {
  // @sf-custom-slot hooks:BpCustomerAcctTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpCustomerAcctTable

// @sf-custom-slot section:BpCustomerAcctTable-custom
