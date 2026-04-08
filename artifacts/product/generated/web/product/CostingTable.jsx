import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:costing
const columns = [
  { key: 'costType', column: 'Costtype', type: 'string' },
  { key: 'cost', column: 'Cost', type: 'string' },
  { key: 'startingDate', column: 'DateFrom', type: 'date' },
  { key: 'endingDate', column: 'DateTo', type: 'date' },
  { key: 'quantity', column: 'Qty', type: 'string' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string' },
];
// @sf-generated-end columns:costing

const filters = [];

// @sf-generated-start component:CostingTable
export default function CostingTable(props) {
  // @sf-custom-slot hooks:CostingTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:CostingTable

// @sf-custom-slot section:CostingTable-custom
