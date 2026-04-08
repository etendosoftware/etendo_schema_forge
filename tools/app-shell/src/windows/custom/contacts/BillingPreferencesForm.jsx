import { EntityForm } from '@/components/contract-ui';

const customerCheckboxField = [
  { key: 'customer', column: 'IsCustomer', type: 'checkbox', label: 'Customer', required: true, section: 'principal' },
];

const customerBillingFields = [
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'account', column: 'FIN_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'customerBlocking', column: 'Customer_Blocking', type: 'checkbox', section: 'principal' },
];

const vendorCheckboxField = [
  { key: 'vendor', column: 'IsVendor', type: 'checkbox', label: 'Vendor', required: true, section: 'principal' },
];

const vendorBillingFields = [
  { key: 'purchasePricelist', column: 'PO_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'pOPaymentMethod', column: 'PO_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'pOPaymentTerms', column: 'PO_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'pOFinancialAccount', column: 'PO_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  { key: 'vendorBlocking', column: 'Vendor_Blocking', type: 'checkbox', section: 'principal' },
];

export default function BillingPreferencesForm(props) {
  const { data } = props;

  return (
    <div className="flex flex-col gap-4">
      {/* Customer checkbox */}
      <EntityForm fields={customerCheckboxField} {...props} />

      {/* Customer billing fields: only shown when Customer is checked */}
      {data?.customer && (
        <div className="pl-4 border-l-2 border-border">
          <EntityForm fields={customerBillingFields} {...props} />
        </div>
      )}

      {/* Vendor checkbox */}
      <EntityForm fields={vendorCheckboxField} {...props} />

      {/* Vendor billing fields: only shown when Vendor is checked */}
      {data?.vendor && (
        <div className="pl-4 border-l-2 border-border">
          <EntityForm fields={vendorBillingFields} {...props} />
        </div>
      )}
    </div>
  );
}
