import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:invoice
const fields = [
  // @sf-custom-slot callout:SL_Invoice_DocType
  { key: 'transactionDocument', column: 'C_DocTypeTarget_ID', type: 'selector', required: true, section: 'principal', reference: 'DocumentType', inputMode: 'selector' },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', required: true, readOnly: true, section: 'other' },
  // @sf-custom-slot callout:SE_Invoice_AccountingDate
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', required: true, section: 'principal' },
  // @sf-custom-slot callout:SE_Invoice_BPartner
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search' },
  // @sf-custom-slot callout:SE_Invoice_BPartnerLocation
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'dependent', required: true, section: 'principal', reference: 'BusinessPartnerLocation', inputMode: 'dependent', dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' } },
  // @sf-custom-slot callout:SL_Invoice_PriceList
  { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', required: true, section: 'other', reference: 'PriceList', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Invoice_TaxDate
  { key: 'accountingDate', column: 'DateAcct', type: 'date', required: true, section: 'other' },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', required: true, section: 'other', reference: 'PaymentTerm', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Invoice_BPartner
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', required: true, section: 'other', reference: 'PaymentMethod', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  { key: 'salesOrder', column: 'C_Order_ID', type: 'selector', readOnly: true, section: 'other', reference: 'Order', inputMode: 'selector' },
  { key: 'orderReference', column: 'POReference', type: 'text', section: 'other' },
  { key: 'documentStatus', column: 'DocStatus', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', required: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'paymentComplete', column: 'Ispaid', type: 'checkbox', required: true, readOnly: true, section: 'other' },
  { key: 'userContact', column: 'AD_User_ID', type: 'search', section: 'other', reference: 'User', inputMode: 'search' },
  { key: 'totalPaid', column: 'Totalpaid', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'taxDate', column: 'Taxdate', type: 'date', section: 'other' },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', readOnly: true, section: 'other' },
  { key: 'dueAmount', column: 'DueAmt', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'salesRepresentative', column: 'SalesRep_ID', type: 'search', section: 'other', reference: 'User', inputMode: 'search' },
  { key: 'withholdingAmount', column: 'Withholdingamount', type: 'number', readOnly: true, section: 'other' },
  { key: 'chargeAmount', column: 'ChargeAmt', type: 'number', section: 'other' },
  { key: 'charge', column: 'C_Charge_ID', type: 'selector', section: 'other', reference: 'Charge', inputMode: 'selector' },
  // @sf-custom-slot callout:SE_Invoice_Project
  { key: 'project', column: 'C_Project_ID', type: 'search', section: 'other', reference: 'Project', inputMode: 'search' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', section: 'other', reference: 'CostCenter', inputMode: 'selector' },
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', section: 'other', reference: 'Asset', inputMode: 'selector' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', section: 'other', reference: 'UserDimension1', inputMode: 'selector' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', section: 'other', reference: 'UserDimension2', inputMode: 'selector' },
  { key: 'prepaymentAmount', column: 'Prepaymentamt', type: 'number', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:invoice

// @sf-generated-start component:InvoiceForm
export default function InvoiceForm(props) {
  // @sf-custom-slot hooks:InvoiceForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:InvoiceForm

// @sf-custom-slot section:InvoiceForm-custom
