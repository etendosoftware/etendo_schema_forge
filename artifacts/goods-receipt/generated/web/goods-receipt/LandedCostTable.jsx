import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:landedCost
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'landedCostType', column: 'M_Lc_Type_ID', type: 'string', label: 'Landed Cost Type' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Amount' },
  { key: 'currency', column: 'C_Currency_ID', type: 'string', label: 'Currency' },
  { key: 'matched', column: 'IsMatched', type: 'boolean', label: 'Matched' },
];
// @sf-generated-end columns:landedCost

const filters = [];

// @sf-generated-start component:LandedCostTable
export default function LandedCostTable(props) {
  // @sf-custom-slot hooks:LandedCostTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:LandedCostTable

// @sf-custom-slot section:LandedCostTable-custom
