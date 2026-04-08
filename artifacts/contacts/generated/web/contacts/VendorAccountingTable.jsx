import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:vendorAccounting
const columns = [

];
// @sf-generated-end columns:vendorAccounting

const filters = [];

// @sf-generated-start component:VendorAccountingTable
export default function VendorAccountingTable(props) {
  // @sf-custom-slot hooks:VendorAccountingTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:VendorAccountingTable

// @sf-custom-slot section:VendorAccountingTable-custom
