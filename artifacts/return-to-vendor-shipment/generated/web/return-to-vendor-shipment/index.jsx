import ReturnShipmentPage from './ReturnShipmentPage';

const windowMeta = { category: 'procurement', name: 'Return to Vendor Shipment' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <ReturnShipmentPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
