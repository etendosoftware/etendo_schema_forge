import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:exchangeRates
const columns = [
  { key: 'currency', column: 'C_Currency_ID', type: 'string', label: 'Currency' },
  { key: 'toCurrency', column: 'C_Currency_Id_To', type: 'string', label: 'To Currency' },
  { key: 'rate', column: 'Rate', type: 'string', label: 'Rate' },
  { key: 'foreignAmount', column: 'Foreign_Amount', type: 'amount', label: 'Foreign  Amount' },
];
// @sf-generated-end columns:exchangeRates

const filters = [];

// @sf-generated-start component:ExchangeRatesTable
export default function ExchangeRatesTable(props) {
  // @sf-custom-slot hooks:ExchangeRatesTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ExchangeRatesTable

// @sf-custom-slot section:ExchangeRatesTable-custom
