import { ListView, DetailView } from '@/components/contract-ui';
import WarehouseTable from './WarehouseTable';
import WarehouseForm from './WarehouseForm';
import LocatorTable from './LocatorTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'isActive', column: 'IsActive', type: 'boolean' },
];

const statusField = null;

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'searchKey', column: 'Value', type: 'text', required: true, lookup: true },
    { key: 'x', column: 'X', type: 'text' },
    { key: 'y', column: 'Y', type: 'text' },
    { key: 'z', column: 'Z', type: 'text' },
    { key: 'priorityNo', column: 'PriorityNo', type: 'number' },
    { key: 'isDefault', column: 'IsDefault', type: 'checkbox', required: true },
  ],
  derived: [

  ],
};

export default function WarehousePage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="warehouse"
        detailEntity="locator"
        Form={WarehouseForm}
        DetailTable={LocatorTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Warehouse"
        detailLabel="Locator"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="warehouse"
      Table={WarehouseTable}
      entityLabel="Warehouse"
      windowName={windowName}
      {...props}
    />
  );
}
