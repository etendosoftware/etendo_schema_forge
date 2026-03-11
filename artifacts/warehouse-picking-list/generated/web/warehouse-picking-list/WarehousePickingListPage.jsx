import { ListView, DetailView } from '@/components/contract-ui';
import WarehousePickingListTable from './WarehousePickingListTable';
import WarehousePickingListForm from './WarehousePickingListForm';
import WarehousePickingListLineTable from './WarehousePickingListLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'status';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, lookup: true },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, reference: 'Product', inputMode: 'search' },
    { key: 'locator', column: 'M_Locator_ID', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
    { key: 'quantityRequired', column: 'QtyRequired', type: 'number', required: true },
    { key: 'quantityPicked', column: 'QtyPicked', type: 'number' },
    { key: 'salesOrder', column: 'C_Order_ID', type: 'search', reference: 'SalesOrder', inputMode: 'search' },
    { key: 'description', column: 'Description', type: 'textarea' },
  ],
  derived: [

  ],
};

export default function WarehousePickingListPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="warehousePickingList"
        detailEntity="warehousePickingListLine"
        Form={WarehousePickingListForm}
        DetailTable={WarehousePickingListLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Warehouse Picking List"
        detailLabel="Warehouse Picking List Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="warehousePickingList"
      Table={WarehousePickingListTable}
      entityLabel="Warehouse Picking List"
      windowName={windowName}
      {...props}
    />
  );
}
