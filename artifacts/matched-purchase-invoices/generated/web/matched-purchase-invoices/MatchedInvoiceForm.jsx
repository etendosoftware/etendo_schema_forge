import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:matchedInvoice
const fields = [
  { key: 'invoiceLine', column: 'C_InvoiceLine_ID', type: 'search', label: 'Invoice Line', required: true, readOnly: true, section: 'principal', reference: 'InvoiceLine', inputMode: 'search' },
  { key: 'goodsShipmentLine', column: 'M_InOutLine_ID', type: 'search', label: 'Goods Receipt Line', required: true, readOnly: true, section: 'principal', reference: 'InOutLine', inputMode: 'search' },
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, readOnly: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'quantity', column: 'Qty', type: 'number', label: 'Quantity', required: true, readOnly: true, section: 'principal' },
  { key: 'transactionDate', column: 'DateTrx', type: 'date', label: 'Transaction Date', required: true, readOnly: true, section: 'principal' },
  { key: 'processed', column: 'Processed', type: 'checkbox', label: 'Processed', required: true, readOnly: true, section: 'principal' },
];
// @sf-generated-end fields:matchedInvoice

// @sf-generated-start component:MatchedInvoiceForm
export default function MatchedInvoiceForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
MatchedInvoiceForm.fields = fields;

// @sf-generated-end component:MatchedInvoiceForm
