import { ListView, DetailView } from '@/components/contract-ui';
import InventoryTable from './InventoryTable';
import InventoryForm from './InventoryForm';
import InventoryLineTable from './InventoryLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, lookup: true },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, reference: 'Product', inputMode: 'search' },
    { key: 'locator', column: 'M_Locator_ID', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
    { key: 'countQuantity', column: 'QtyCount', type: 'number', required: true },
  ],
  derived: [

  ],
};

export default function InventoryPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="inventory"
        detailEntity="inventoryLine"
        Form={InventoryForm}
        DetailTable={InventoryLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Inventory"
        detailLabel="Inventory Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="inventory"
      Table={InventoryTable}
      entityLabel="Inventory"
      windowName={windowName}
      {...props}
    />
  );
}
