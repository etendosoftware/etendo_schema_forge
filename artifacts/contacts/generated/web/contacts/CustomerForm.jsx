import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:customer
const fields = [
  { key: 'customer', column: 'IsCustomer', type: 'checkbox', label: 'Customer', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'search', label: 'Price List', section: 'principal', reference: 'PriceList', inputMode: 'search' },
  { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'search', label: 'Payment Method', section: 'principal', reference: 'PaymentMethod', inputMode: 'search' },
  { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', label: 'Payment Terms', section: 'principal', reference: 'PaymentTerm', inputMode: 'selector' },
  { key: 'account', column: 'FIN_Financial_Account_ID', type: 'search', label: 'Financial Account', section: 'other', reference: 'Financial_Account', inputMode: 'search' },
  { key: 'salesRepresentative', column: 'SalesRep_ID', type: 'search', label: 'Sales Representative', section: 'other', reference: 'BPartner', inputMode: 'search' },
  { key: 'invoiceTerms', column: 'InvoiceRule', type: 'select', label: 'Invoice Terms', section: 'other', options: [{ value: 'D', label: 'After Delivery', labels: {"es_ES":"After Delivery"} }, { value: 'O', label: 'After Order Delivered', labels: {"es_ES":"After Order Delivered"} }, { value: 'S', label: 'Customer Schedule After Delivery', labels: {"es_ES":"Customer Schedule After Delivery"} }, { value: 'N', label: 'Do Not Invoice', labels: {"es_ES":"Do Not Invoice"} }, { value: 'I', label: 'Immediate', labels: {"es_ES":"Immediate"} }], defaultValue: 'I' },
  { key: 'invoiceSchedule', column: 'C_InvoiceSchedule_ID', type: 'selector', label: 'Invoice Schedule', section: 'other', reference: 'InvoiceSchedule', inputMode: 'selector' },
  { key: 'taxExempt', column: 'IsTaxExempt', type: 'checkbox', label: 'Tax Exempt', section: 'other' },
  { key: 'customerBlocking', column: 'Customer_Blocking', type: 'checkbox', label: 'On Hold', required: true, section: 'other' },
  { key: 'salesOrder', column: 'SO_Order_Blocking', type: 'checkbox', label: 'Sales Order', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'goodsShipment', column: 'SO_Goods_Blocking', type: 'checkbox', label: 'Goods Shipment', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'salesInvoice', column: 'SO_Invoice_Blocking', type: 'checkbox', label: 'Sales Invoice', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'paymentIn', column: 'SO_Payment_Blocking', type: 'checkbox', label: 'Payment In', required: true, section: 'other' },
  { key: 'sOBPTaxCategory', column: 'SO_Bp_Taxcategory_ID', type: 'search', label: 'SO BP Tax Category', section: 'other', reference: 'BP_TaxCategory', inputMode: 'search' },
  { key: 'maturityDate1', column: 'FixMonthDay', type: 'number', label: 'Maturity Date 1', section: 'other' },
  { key: 'maturityDate2', column: 'FixMonthDay2', type: 'number', label: 'Maturity Date 2', section: 'other' },
  { key: 'maturityDate3', column: 'Fixmonthday3', type: 'number', label: 'Maturity Date 3', section: 'other' },
  { key: 'birthDay', column: 'Birthday', type: 'date', label: 'Birthdate', section: 'other' },
  { key: 'birthPlace', column: 'Birthplace', type: 'text', label: 'Birthplace', section: 'other' },
  { key: 'aeatsiiDefaultsiikey', column: 'EM_Aeatsii_Defaultsiikey', type: 'checkbox', label: 'Default Key', required: true, section: 'other' },
  { key: 'aeatsiiSiikeylist', column: 'EM_Aeatsii_Siikeylist', type: 'select', label: 'Invoice type key', section: 'other', options: [{ value: 'R', label: 'Corrective invoice', labels: {"es_ES":"Factura rectificativa"} }, { value: 'F1', label: 'Invoice', labels: {"es_ES":"Factura"} }, { value: 'F2', label: 'Simplified invoice', labels: {"es_ES":"Factura simplificada"} }, { value: 'F4', label: 'Simplified invoices summary', labels: {"es_ES":"Asiento resumen facturas simplificadas"} }], defaultValue: 'F1' },
];
// @sf-generated-end fields:customer

// @sf-generated-start component:CustomerForm
export default function CustomerForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:CustomerForm
