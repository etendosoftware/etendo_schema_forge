import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:costSalaryCategory
const columns = [

];
// @sf-generated-end columns:costSalaryCategory

const filters = [];

// @sf-generated-start component:CostSalaryCategoryTable
export default function CostSalaryCategoryTable(props) {
  // @sf-custom-slot hooks:CostSalaryCategoryTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:CostSalaryCategoryTable

// @sf-custom-slot section:CostSalaryCategoryTable-custom
