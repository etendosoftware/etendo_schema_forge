import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:costing
const columns = [
  { key: 'costType', column: 'Costtype', type: 'enum', label: 'Cost Type', enumLabels: { 'AVA': 'Average', 'STA': 'Standard' } },
  { key: 'cost', column: 'Cost', type: 'number', label: 'Cost' },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date' },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date' },
  { key: 'quantity', column: 'Qty', type: 'number', label: 'Quantity' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string', label: 'Warehouse' },
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
