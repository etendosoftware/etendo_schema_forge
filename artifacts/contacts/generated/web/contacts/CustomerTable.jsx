import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:customer
const columns = [

];
// @sf-generated-end columns:customer

const filters = [];

// @sf-generated-start component:CustomerTable
export default function CustomerTable(props) {
  // @sf-custom-slot hooks:CustomerTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:CustomerTable

// @sf-custom-slot section:CustomerTable-custom
