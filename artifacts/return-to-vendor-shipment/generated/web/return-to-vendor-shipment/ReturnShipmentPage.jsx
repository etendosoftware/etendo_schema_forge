import { ListView, DetailView } from '@/components/contract-ui';
import ReturnShipmentTable from './ReturnShipmentTable';
import ReturnShipmentForm from './ReturnShipmentForm';
import ReturnShipmentLineTable from './ReturnShipmentLineTable';
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
    { key: 'returnOrderLine', column: 'C_OrderLine_ID', type: 'dependent', reference: 'PurchaseOrderLine', inputMode: 'dependent', dependsOn: { field: 'returnShipment.orderReference', filterKey: 'cOrderId' } },
    { key: 'rmaLine', column: 'M_RMALine_ID', type: 'dependent', reference: 'ReturnMaterialAuthorizationLine', inputMode: 'dependent', dependsOn: { field: 'returnShipment.returnReason', filterKey: 'mRmaId' } },
  ],
  derived: [

  ],
};

export default function ReturnShipmentPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="returnShipment"
        detailEntity="returnShipmentLine"
        Form={ReturnShipmentForm}
        DetailTable={ReturnShipmentLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Return Shipment"
        detailLabel="Return Shipment Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="returnShipment"
      Table={ReturnShipmentTable}
      entityLabel="Return Shipments"
      windowName={windowName}
      {...props}
    />
  );
}
