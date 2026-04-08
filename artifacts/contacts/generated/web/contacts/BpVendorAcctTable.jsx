import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpVendorAcct
const columns = [

];
// @sf-generated-end columns:bpVendorAcct

const filters = [];

// @sf-generated-start component:BpVendorAcctTable
export default function BpVendorAcctTable(props) {
  // @sf-custom-slot hooks:BpVendorAcctTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpVendorAcctTable

// @sf-custom-slot section:BpVendorAcctTable-custom
