import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:employee
const columns = [

];
// @sf-generated-end columns:employee

const filters = [];

// @sf-generated-start component:EmployeeTable
export default function EmployeeTable(props) {
  // @sf-custom-slot hooks:EmployeeTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:EmployeeTable

// @sf-custom-slot section:EmployeeTable-custom
