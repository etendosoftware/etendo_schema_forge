import { ListView, DetailView } from '@/components/contract-ui';
import GoodsShipmentTable from './GoodsShipmentTable';
import GoodsShipmentForm from './GoodsShipmentForm';
import GoodsShipmentLineTable from './GoodsShipmentLineTable';
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

export default function GoodsShipmentPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="goodsShipment"
        detailEntity="goodsShipmentLine"
        Form={GoodsShipmentForm}
        DetailTable={GoodsShipmentLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Goods Shipment"
        detailLabel="Goods Shipment Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="goodsShipment"
      Table={GoodsShipmentTable}
      entityLabel="Goods Shipment"
      windowName={windowName}
      {...props}
    />
  );
}
