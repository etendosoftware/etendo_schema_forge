import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpSalcategory
const columns = [

];
// @sf-generated-end columns:bpSalcategory

const filters = [];

// @sf-generated-start component:BpSalcategoryTable
export default function BpSalcategoryTable(props) {
  // @sf-custom-slot hooks:BpSalcategoryTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpSalcategoryTable

// @sf-custom-slot section:BpSalcategoryTable-custom
