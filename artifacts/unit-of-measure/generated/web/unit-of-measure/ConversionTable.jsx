import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:conversion
const columns = [
  { key: 'toUOM', column: 'C_UOM_To_ID', type: 'string', label: 'To UOM' },
  { key: 'multipleRateBy', column: 'MultiplyRate', type: 'string', label: 'Multiple Rate By' },
  { key: 'divideRateBy', column: 'DivideRate', type: 'string', label: 'Divide Rate By' },
];
// @sf-generated-end columns:conversion

const filters = ['toUOM'];

// @sf-generated-start component:ConversionTable
export default function ConversionTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ConversionTable
