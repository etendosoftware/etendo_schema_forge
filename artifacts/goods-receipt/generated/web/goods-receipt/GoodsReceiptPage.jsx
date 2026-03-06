import { MasterDetailPage } from '@/components/contract-ui';
import GoodsReceiptTable from './GoodsReceiptTable';
import GoodsReceiptForm from './GoodsReceiptForm';
import GoodsReceiptLineTable from './GoodsReceiptLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', label: 'Product', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'movementQty', label: 'Movement Qty', type: 'number', required: true },
    { key: 'locator', label: 'Locator', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
    { key: 'lineNo', label: 'Line No', type: 'number', required: true },
    { key: 'description', label: 'Description', type: 'text' },
  ],
  derived: [

  ],
};

export default function GoodsReceiptPage(props) {
  return (
    <MasterDetailPage
      entity="goodsReceipt"
      detailEntity="goodsReceiptLine"
      Table={GoodsReceiptTable}
      Form={GoodsReceiptForm}
      DetailTable={GoodsReceiptLineTable}
      summary={summary}
      statusField={statusField}
      processes={processes}
      addLineFields={addLineFields}
      catalogs={catalogs}
      entityLabel="Goods Receipt"
      detailLabel="Goods Receipt Line"
      {...props}
    />
  );
}
