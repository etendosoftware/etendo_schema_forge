import InventoryPage from './InventoryPage';

const windowMeta = { category: 'warehouse', name: 'Physical Inventory' };

export default function App({ token, apiBaseUrl, window }) {
  return <InventoryPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
