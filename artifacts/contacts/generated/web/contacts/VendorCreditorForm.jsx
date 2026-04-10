import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:vendorCreditor
const fields = [
  { key: 'vendor', column: 'IsVendor', type: 'checkbox', label: 'Vendor', required: true, section: 'principal' },
  { key: 'purchasePricelist', column: 'PO_PriceList_ID', type: 'search', label: 'Purchase Pricelist', section: 'principal', reference: 'PriceList', inputMode: 'search' },
  // @sf-custom-slot callout:SE_PaymentMethod_FinAccount
  { key: 'pOPaymentMethod', column: 'PO_Paymentmethod_ID', type: 'search', label: 'PO Payment Method', section: 'principal', reference: 'PaymentMethod', inputMode: 'search' },
  { key: 'pOPaymentTerms', column: 'PO_PaymentTerm_ID', type: 'search', label: 'PO Payment Terms', section: 'principal', reference: 'PaymentTerm', inputMode: 'search' },
  { key: 'pOFinancialAccount', column: 'PO_Financial_Account_ID', type: 'search', label: 'PO Financial Account', section: 'other', reference: 'Financial_Account', inputMode: 'search' },
  { key: 'pOMaturityDate1', column: 'PO_Fixmonthday', type: 'number', label: 'PO Maturity Date 1', section: 'other' },
  { key: 'pOMaturityDate2', column: 'PO_Fixmonthday2', type: 'number', label: 'PO Maturity Date 2', section: 'other' },
  { key: 'pOMaturityDate3', column: 'PO_Fixmonthday3', type: 'number', label: 'PO Maturity Date 3', section: 'other' },
  { key: 'taxCategory', column: 'PO_BP_TaxCategory_ID', type: 'search', label: 'Tax Category', section: 'other', reference: 'BP_TaxCategory', inputMode: 'search' },
  { key: 'cashVAT', column: 'Iscashvat', type: 'checkbox', label: 'Cash VAT', required: true, section: 'other', defaultValue: 'N' },
  { key: 'vendorBlocking', column: 'Vendor_Blocking', type: 'checkbox', label: 'On Hold', required: true, section: 'other', defaultValue: 'N' },
  { key: 'purchaseOrder', column: 'PO_Order_Blocking', type: 'checkbox', label: 'Purchase Order', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'goodsReceipt', column: 'PO_Goods_Blocking', type: 'checkbox', label: 'Goods Receipt', required: true, section: 'other', defaultValue: 'N' },
  { key: 'purchaseInvoice', column: 'PO_Invoice_Blocking', type: 'checkbox', label: 'Purchase Invoice', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'paymentOut', column: 'PO_Payment_Blocking', type: 'checkbox', label: 'Payment Out', required: true, section: 'other', defaultValue: 'Y' },
];
// @sf-generated-end fields:vendorCreditor

// @sf-generated-start component:VendorCreditorForm
export default function VendorCreditorForm(props) {
  // @sf-custom-slot hooks:VendorCreditorForm
  return <EntityForm fields={fields} {...props} />;
}
VendorCreditorForm.hasCollapsedFields = false;
// @sf-generated-end component:VendorCreditorForm

// @sf-custom-slot section:VendorCreditorForm-custom
