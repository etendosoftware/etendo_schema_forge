import { ListView, DetailView } from '@/components/contract-ui';
import QuotationTable from './QuotationTable';
import QuotationForm from './QuotationForm';
import QuotationLineTable from './QuotationLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotal', column: 'GrandTotal', type: 'amount' },
  { key: 'totalLines', column: 'TotalLines', type: 'amount' },
  { key: 'currency', column: 'C_Currency_ID', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'quantity', column: 'QtyOrdered', type: 'number', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
  ],
  derived: [
    { key: 'unitPrice', column: 'PriceActual', type: 'number' },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', reference: 'Tax', inputMode: 'selector' },
    { key: 'discount', column: 'Discount', type: 'number' },
  ],
};

export default function QuotationPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="quotation"
        detailEntity="quotationLine"
        Form={QuotationForm}
        DetailTable={QuotationLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Quotation"
        detailLabel="Quotation Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="quotation"
      Table={QuotationTable}
      entityLabel="Quotations"
      windowName={windowName}
      {...props}
    />
  );
}
