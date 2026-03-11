import GoodsShipmentPage from './GoodsShipmentPage';

const windowMeta = { category: 'sales', name: 'Goods Shipment' };

export default function App({ token, apiBaseUrl, window }) {
  return <GoodsShipmentPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
