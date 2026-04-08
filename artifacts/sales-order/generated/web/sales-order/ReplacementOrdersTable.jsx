import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:replacementOrders
const columns = [

];
// @sf-generated-end columns:replacementOrders

const filters = [];

// @sf-generated-start component:ReplacementOrdersTable
export default function ReplacementOrdersTable(props) {
  // @sf-custom-slot hooks:ReplacementOrdersTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ReplacementOrdersTable

// @sf-custom-slot section:ReplacementOrdersTable-custom
