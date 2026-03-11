import { ListView, DetailView } from '@/components/contract-ui';
import WarehouseTable from './WarehouseTable';
import WarehouseForm from './WarehouseForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'Warehouse' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="warehouse"
        Form={WarehouseForm}
        catalogs={catalogs}
        entityLabel="Warehouse"
        windowName={windowName}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="warehouse"
      Table={WarehouseTable}
      entityLabel="Warehouses"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
