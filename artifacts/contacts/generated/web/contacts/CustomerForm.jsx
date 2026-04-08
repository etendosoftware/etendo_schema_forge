import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'customer', column: 'IsCustomer', type: 'checkbox', section: 'principal' },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.customer },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.customer },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.customer },
  { key: 'account', column: 'FIN_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.customer },
  { key: 'customerBlocking', column: 'Customer_Blocking', type: 'checkbox', section: 'principal', displayLogic: (record) => record.customer },
];

export default function CustomerForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
