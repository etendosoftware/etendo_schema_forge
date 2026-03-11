import GoodsMovementPage from './GoodsMovementPage';

const windowMeta = { category: 'warehouseManagement', name: 'Goods Movements' };

export default function App({ token, apiBaseUrl, window }) {
  return <GoodsMovementPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
