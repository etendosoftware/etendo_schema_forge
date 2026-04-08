import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:invoice
const fields = [
  // @sf-custom-slot callout:SL_Invoice_DocType
  { key: 'transactionDocument', column: 'C_DocTypeTarget_ID', type: 'selector', label: 'Transaction Document', required: true, section: 'other', reference: 'DocumentType', inputMode: 'selector' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal' },
  // @sf-custom-slot callout:SE_Invoice_AccountingDate
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', label: 'Invoice Date', required: true, section: 'principal', defaultValue: '@#Date@' },
  // @sf-custom-slot callout:SE_Invoice_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  // @sf-custom-slot callout:SE_Invoice_BPartnerLocation
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', label: 'Partner Address', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  // @sf-custom-slot callout:SL_Invoice_PriceList
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', label: 'Price List', required: true, section: 'other', reference: 'PriceList', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Invoice_TaxDate
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, section: 'other', defaultValue: '@#Date@' },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', label: 'Payment Terms', required: true, section: 'other', reference: 'PaymentTerm', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Invoice_BPartner
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'other', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
  { key: 'salesOrder', column: 'C_Order_ID', type: 'selector', label: 'Purchase Order', readOnly: true, section: 'other', reference: 'Order', inputMode: 'selector' },
  { key: 'orderReference', column: 'POReference', type: 'text', label: 'Supplier Reference', section: 'other' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@' },
  { key: 'userContact', column: 'AD_User_ID', type: 'search', label: 'User/Contact', section: 'other', reference: 'User', inputMode: 'search' },
  { key: 'salesRepresentative', column: 'SalesRep_ID', type: 'search', label: 'Company Agent', section: 'other', reference: 'User', inputMode: 'search' },
  { key: 'chargeAmount', column: 'ChargeAmt', type: 'number', label: 'Charge Amount', section: 'other' },
  { key: 'charge', column: 'C_Charge_ID', type: 'selector', label: 'Charge', section: 'other', reference: 'Charge', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Invoice_Project
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'other', reference: 'Project', inputMode: 'search' },
  { key: 'prepaymentAmount', column: 'Prepaymentamt', type: 'number', label: 'Prepayment Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:invoice

// @sf-generated-start component:InvoiceForm
export default function InvoiceForm(props) {
  // @sf-custom-slot hooks:InvoiceForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:InvoiceForm

// @sf-custom-slot section:InvoiceForm-custom
