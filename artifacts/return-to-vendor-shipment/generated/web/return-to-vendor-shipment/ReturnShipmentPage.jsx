import { useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import ReturnShipmentTable from './ReturnShipmentTable';
import ReturnShipmentForm from './ReturnShipmentForm';
import ReturnShipmentLineTable from './ReturnShipmentLineTable';
import ReturnShipmentLineForm from './ReturnShipmentLineForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Return to Vendor Shipment';


// @sf-generated-start summary:returnShipment
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'docStatus';
// @sf-generated-end summary:returnShipmentnono 

// @sf-generated-start extraBadges:returnShipment
const extraBadges = [];
// @sf-generated-end extraBadges:returnShipment

// @sf-generated-start processes:returnShipment
const processes = [

];
// @sf-generated-end processes:returnShipment

// @sf-generated-start draftMode:returnShipment
const draftMode = null;
// @sf-generated-end draftMode:returnShipment

// @sf-generated-start addLineFields:returnShipmentLine
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
  hidden: [

  ],
};
// @sf-generated-end addLineFields:returnShipmentLine

// @sf-generated-start component:ReturnShipmentPage
export default function ReturnShipmentPage({ windowName, recordId, ...props }) {
  
  if (recordId) {
    return (
      <DetailView
        entity="returnShipment"
        detailEntity="returnShipmentLine"
        Form={ReturnShipmentForm}
        DetailTable={ReturnShipmentLineTable}
        DetailForm={ReturnShipmentLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Return Shipment"
        detailLabel="Return Shipment Line"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        notesField="description"
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="returnShipment"
      Table={ReturnShipmentTable}
      entityLabel="Return to Vendor Shipment"
      windowName={windowName}
      breadcrumb={breadcrumb}
      {...props}
    />
  );
}
// @sf-generated-end component:ReturnShipmentPage
