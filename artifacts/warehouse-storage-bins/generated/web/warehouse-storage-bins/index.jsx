import WarehousePage from './WarehousePage';

const windowMeta = { category: 'setup', name: 'Warehouse Storage Bins' };

export default function App({ token, apiBaseUrl, window }) {
  return <WarehousePage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
