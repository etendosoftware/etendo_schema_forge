import InventoryPage, { api } from './InventoryPage';

const windowMeta = { category: 'inventory', name: 'Physical Inventory', id: '168' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <InventoryPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
