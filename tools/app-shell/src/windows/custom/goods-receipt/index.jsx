import GoodsReceiptTable from '@generated/goods-receipt/generated/web/goods-receipt/GoodsReceiptTable';
import GeneratedApp from '@generated/goods-receipt/generated/web/goods-receipt/index.jsx';
import GoodsReceiptBottomPanel from './GoodsReceiptBottomPanel.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';
import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';

const HEADER_COLUMNS = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', dot: false },
  { key: 'orderReference', column: 'POReference', type: 'string' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status' },
];

function CustomHeaderTable(props) {
  return <GoodsReceiptTable columns={HEADER_COLUMNS} {...props} />;
}

export default function GoodsReceiptWindow(props) {
  useBulkActionToast();
  return (
    <GeneratedApp
      {...props}
      Table={CustomHeaderTable}
      secondaryTabs={[]}
      notesField="description"
      bottomSection={GoodsReceiptBottomPanel}
      customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
      bulkActions={(ctx) => (
        <BulkDocumentAction {...ctx} entity="goodsReceipt" buildActions={buildInOutActions} />
      )}
    />
  );
}
