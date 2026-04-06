import GoodsReceiptLineTable from '@generated/goods-receipt/generated/web/goods-receipt/GoodsReceiptLineTable';
import GeneratedApp from '@generated/goods-receipt/generated/web/goods-receipt/index.jsx';
import GoodsReceiptBottomPanel from './GoodsReceiptBottomPanel.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';

// Lines table columns without lineNo
const LINES_COLUMNS = [
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string', label: 'Storage Bin' },
  { key: 'invoiceQuantity', column: 'Qtyinvoiced', type: 'number', label: 'Invoiced Quantity' },
];

function CustomLinesTable(props) {
  return <GoodsReceiptLineTable columns={LINES_COLUMNS} {...props} />;
}

export default function GoodsReceiptWindow(props) {
  return (
    <GeneratedApp
      {...props}
      DetailTable={CustomLinesTable}
      secondaryTabs={[]}
      notesField="description"
      bottomSection={GoodsReceiptBottomPanel}
      customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
    />
  );
}
