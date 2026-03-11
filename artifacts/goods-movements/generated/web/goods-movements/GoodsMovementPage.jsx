import { ListView, DetailView } from '@/components/contract-ui';
import GoodsMovementTable from './GoodsMovementTable';
import GoodsMovementForm from './GoodsMovementForm';
import GoodsMovementLineTable from './GoodsMovementLineTable';
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
    { key: 'locatorFrom', column: 'M_Locator_ID', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
    { key: 'locatorTo', column: 'M_LocatorTo_ID', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
  ],
  derived: [

  ],
};

export default function GoodsMovementPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="goodsMovement"
        detailEntity="goodsMovementLine"
        Form={GoodsMovementForm}
        DetailTable={GoodsMovementLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Goods Movement"
        detailLabel="Goods Movement Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="goodsMovement"
      Table={GoodsMovementTable}
      entityLabel="Goods Movements"
      windowName={windowName}
      {...props}
    />
  );
}
