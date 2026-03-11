import WarehousePickingListPage from './WarehousePickingListPage';

const windowMeta = { category: 'warehouse', name: 'Warehouse Picking List' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <WarehousePickingListPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
