import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:exchangeRates
const fields = [
  { key: 'toCurrency', column: 'C_Currency_Id_To', type: 'search', label: 'To Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'search', readOnlyLogic: (record) => record['hASREVERSEDINVOICESO'] === 'Y' || record['hASREVERSEDINVOICEPO'] === 'Y' || record['posted'] === true },
  { key: 'rate', column: 'Rate', type: 'text', label: 'Rate', section: 'principal', readOnlyLogic: (record) => record['hASREVERSEDINVOICESO'] === 'Y' || record['hASREVERSEDINVOICEPO'] === 'Y' || record['posted'] === true },
  { key: 'foreignAmount', column: 'Foreign_Amount', type: 'number', label: 'Foreign  Amount', required: true, section: 'principal', defaultValue: '0', readOnlyLogic: (record) => record['hASREVERSEDINVOICESO'] === 'Y' || record['hASREVERSEDINVOICEPO'] === 'Y' || record['posted'] === true },
];
// @sf-generated-end fields:exchangeRates

// @sf-generated-start component:ExchangeRatesForm
export default function ExchangeRatesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ExchangeRatesForm
