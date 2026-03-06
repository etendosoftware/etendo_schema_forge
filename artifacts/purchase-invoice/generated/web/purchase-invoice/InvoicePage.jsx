import { MasterDetailPage } from '@/components/contract-ui';
import InvoiceTable from './InvoiceTable';
import InvoiceForm from './InvoiceForm';
import InvoiceLineTable from './InvoiceLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'isPaid', label: 'Is Paid', type: 'boolean' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', label: 'Product', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true },
    { key: 'lineNo', label: 'Line No', type: 'number', required: true },
    { key: 'description', label: 'Description', type: 'text' },
  ],
  derived: [
    { key: 'unitPrice', label: 'Unit Price', type: 'number' },
    { key: 'priceList', label: 'Price List', type: 'number' },
    { key: 'tax', label: 'Tax', type: 'selector', reference: 'Tax', inputMode: 'selector' },
    { key: 'discount', label: 'Discount', type: 'number' },
  ],
};

export default function InvoicePage(props) {
  return (
    <MasterDetailPage
      entity="invoice"
      detailEntity="invoiceLine"
      Table={InvoiceTable}
      Form={InvoiceForm}
      DetailTable={InvoiceLineTable}
      summary={summary}
      statusField={statusField}
      processes={processes}
      addLineFields={addLineFields}
      catalogs={catalogs}
      entityLabel="Invoice"
      detailLabel="Invoice Line"
      {...props}
    />
  );
}
