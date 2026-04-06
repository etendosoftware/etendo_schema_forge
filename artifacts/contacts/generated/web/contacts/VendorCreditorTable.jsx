import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:vendorCreditor
const columns = [

];
// @sf-generated-end columns:vendorCreditor

const filters = [];

// @sf-generated-start component:VendorCreditorTable
export default function VendorCreditorTable(props) {
  // @sf-custom-slot hooks:VendorCreditorTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:VendorCreditorTable

// @sf-custom-slot section:VendorCreditorTable-custom
