import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:unitOfMeasure
const columns = [
  { key: 'eDICode', column: 'X12DE355', type: 'string', label: 'EDI Code' },
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'symbol', column: 'UOMSymbol', type: 'string', label: 'Symbol' },
  { key: 'uOMType', column: 'UOM_Type', type: 'enum', label: 'UOM Type', enumLabels: { 'A': 'Area', 'L': 'Length', 'T': 'Time', 'V': 'Volume', 'W': 'Weight' } },
];
// @sf-generated-end columns:unitOfMeasure

const filters = ['eDICode', 'name'];

// @sf-generated-start component:UnitOfMeasureTable
export default function UnitOfMeasureTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:UnitOfMeasureTable
