import { ListView, DetailView } from '@/components/contract-ui';
import GoodsReceiptTable from './GoodsReceiptTable';
import GoodsReceiptForm from './GoodsReceiptForm';
import GoodsReceiptLineTable from './GoodsReceiptLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'movementQty', column: 'MovementQty', type: 'number', required: true },
    { key: 'locator', column: 'M_Locator_ID', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
  ],
  derived: [

  ],
};

export default function GoodsReceiptPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="goodsReceipt"
        detailEntity="goodsReceiptLine"
        Form={GoodsReceiptForm}
        DetailTable={GoodsReceiptLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Goods Receipt"
        detailLabel="Goods Receipt Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="goodsReceipt"
      Table={GoodsReceiptTable}
      entityLabel="Goods Receipts"
      windowName={windowName}
      {...props}
    />
  );
}
