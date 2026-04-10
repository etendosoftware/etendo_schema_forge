import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:amortizationLine
const columns = [
  { key: 'sEQNoAsset', column: 'SEQ_No_Asset', type: 'number', label: 'Line No.' },
  { key: 'amortization', column: 'A_Amortization_ID', type: 'string', label: 'Amortization' },
  { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', label: 'Amortization Percentage' },
  { key: 'amortizationAmount', column: 'Amortizationamt', type: 'amount', label: 'Amortization Amount' },
  { key: 'currency', column: 'C_Currency_ID', type: 'string', label: 'Currency' },
];
// @sf-generated-end columns:amortizationLine

const filters = [];

// @sf-generated-start component:AmortizationLineTable
export default function AmortizationLineTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:AmortizationLineTable
