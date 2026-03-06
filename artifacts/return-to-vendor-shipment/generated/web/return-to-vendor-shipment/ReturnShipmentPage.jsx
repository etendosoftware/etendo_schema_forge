import { MasterDetailPage } from '@/components/contract-ui';
import ReturnShipmentTable from './ReturnShipmentTable';
import ReturnShipmentForm from './ReturnShipmentForm';
import ReturnShipmentLineTable from './ReturnShipmentLineTable';
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
    { key: 'returnOrderLine', label: 'Return Order Line', type: 'dependent', reference: 'PurchaseOrderLine', inputMode: 'dependent', dependsOn: { field: 'returnShipment.orderReference', filterKey: 'cOrderId' } },
    { key: 'rmaLine', label: 'Rma Line', type: 'dependent', reference: 'ReturnMaterialAuthorizationLine', inputMode: 'dependent', dependsOn: { field: 'returnShipment.returnReason', filterKey: 'mRmaId' } },
  ],
  derived: [

  ],
};

export default function ReturnShipmentPage(props) {
  return (
    <MasterDetailPage
      entity="returnShipment"
      detailEntity="returnShipmentLine"
      Table={ReturnShipmentTable}
      Form={ReturnShipmentForm}
      DetailTable={ReturnShipmentLineTable}
      summary={summary}
      statusField={statusField}
      processes={processes}
      addLineFields={addLineFields}
      catalogs={catalogs}
      entityLabel="Return Shipment"
      detailLabel="Return Shipment Line"
      {...props}
    />
  );
}
