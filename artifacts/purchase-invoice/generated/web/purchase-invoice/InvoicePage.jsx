import { ListView, DetailView } from '@/components/contract-ui';
import InvoiceTable from './InvoiceTable';
import InvoiceForm from './InvoiceForm';
import InvoiceLineTable from './InvoiceLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotal', column: 'GrandTotal', type: 'amount' },
  { key: 'totalLines', column: 'TotalLines', type: 'amount' },
  { key: 'isPaid', column: 'IsPaid', type: 'boolean' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'quantity', column: 'QtyInvoiced', type: 'number', required: true },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
  ],
  derived: [
    { key: 'unitPrice', column: 'PriceActual', type: 'number' },
    { key: 'priceList', column: 'PriceList', type: 'number' },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', reference: 'Tax', inputMode: 'selector' },
    { key: 'discount', column: 'Discount', type: 'number' },
  ],
};

export default function InvoicePage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="invoice"
        detailEntity="invoiceLine"
        Form={InvoiceForm}
        DetailTable={InvoiceLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Invoice"
        detailLabel="Invoice Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="invoice"
      Table={InvoiceTable}
      entityLabel="Invoice"
      windowName={windowName}
      {...props}
    />
  );
}
