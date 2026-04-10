import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:alternateUom
const columns = [
  { key: 'uOM', column: 'C_Uom_ID', type: 'string', label: 'UOM' },
  { key: 'conversionRate', column: 'Conversionrate', type: 'number', label: 'Conversion Rate' },
  { key: 'sales', column: 'Sales', type: 'enum', label: 'Sales', enumLabels: { 'P': 'Primary', 'S': 'Secondary', 'NA': 'Not Applicable' } },
  { key: 'purchase', column: 'Purchase', type: 'enum', label: 'Purchase', enumLabels: { 'P': 'Primary', 'S': 'Secondary', 'NA': 'Not Applicable' } },
  { key: 'logistics', column: 'Logistics', type: 'enum', label: 'Logistics', enumLabels: { 'P': 'Primary', 'S': 'Secondary', 'NA': 'Not Applicable' } },
];
// @sf-generated-end columns:alternateUom

const filters = [];

// @sf-generated-start component:AlternateUomTable
export default function AlternateUomTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:AlternateUomTable
