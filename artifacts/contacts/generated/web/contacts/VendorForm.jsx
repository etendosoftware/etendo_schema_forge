import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'vendor', column: 'IsVendor', type: 'checkbox', section: 'principal' },
  { key: 'purchasePricelist', column: 'PO_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.vendor },
  { key: 'pOPaymentMethod', column: 'PO_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.vendor },
  { key: 'pOPaymentTerms', column: 'PO_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.vendor },
  { key: 'pOFinancialAccount', column: 'PO_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector', displayLogic: (record) => record.vendor },
  { key: 'vendorBlocking', column: 'Vendor_Blocking', type: 'checkbox', section: 'principal', displayLogic: (record) => record.vendor },
];

export default function VendorForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
