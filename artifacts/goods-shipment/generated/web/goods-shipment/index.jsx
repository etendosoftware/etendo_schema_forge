import GoodsShipmentPage from './GoodsShipmentPage';

const windowMeta = { category: 'sales', name: 'Goods Shipment' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <GoodsShipmentPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
