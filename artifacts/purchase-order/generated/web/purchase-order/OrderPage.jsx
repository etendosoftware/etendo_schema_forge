import { MasterDetailPage } from '@/components/contract-ui';
import OrderTable from './OrderTable';
import OrderForm from './OrderForm';
import OrderLineTable from './OrderLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'currency', label: 'Currency', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', label: 'Product', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'lineNo', label: 'Line No', type: 'number', required: true },
  ],
  derived: [
    { key: 'unitPrice', label: 'Unit Price', type: 'number' },
    { key: 'tax', label: 'Tax', type: 'selector', reference: 'Tax', inputMode: 'selector' },
    { key: 'discount', label: 'Discount', type: 'number' },
  ],
};

export default function OrderPage(props) {
  return (
    <MasterDetailPage
      entity="order"
      detailEntity="orderLine"
      Table={OrderTable}
      Form={OrderForm}
      DetailTable={OrderLineTable}
      summary={summary}
      statusField={statusField}
      processes={processes}
      addLineFields={addLineFields}
      catalogs={catalogs}
      entityLabel="Order"
      detailLabel="Order Line"
      {...props}
    />
  );
}
