import { ListView, DetailView } from '@/components/contract-ui';
import ReturnReceiptTable from './ReturnReceiptTable';
import ReturnReceiptForm from './ReturnReceiptForm';
import ReturnReceiptLineTable from './ReturnReceiptLineTable';
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
    { key: 'returnOrderLine', column: 'C_OrderLine_ID', type: 'dependent', reference: 'SalesOrderLine', inputMode: 'dependent', dependsOn: { field: 'returnReceipt.orderReference', filterKey: 'cOrderId' } },
    { key: 'rmaLine', column: 'M_RMALine_ID', type: 'dependent', reference: 'ReturnMaterialAuthorizationLine', inputMode: 'dependent', dependsOn: { field: 'returnReceipt.returnReason', filterKey: 'mRmaId' } },
  ],
  derived: [

  ],
};

export default function ReturnReceiptPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="returnReceipt"
        detailEntity="returnReceiptLine"
        Form={ReturnReceiptForm}
        DetailTable={ReturnReceiptLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Return Receipt"
        detailLabel="Return Receipt Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="returnReceipt"
      Table={ReturnReceiptTable}
      entityLabel="Return Receipt"
      windowName={windowName}
      {...props}
    />
  );
}
