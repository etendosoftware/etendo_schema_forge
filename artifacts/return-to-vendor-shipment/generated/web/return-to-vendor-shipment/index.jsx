import ReturnShipmentPage from './ReturnShipmentPage';

const windowMeta = { category: 'procurement', name: 'Return to Vendor Shipment' };

<<<<<<< HEAD
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ReturnShipmentPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} {...rest} />;
=======
export default function App({ token, apiBaseUrl, window }) {
  return <ReturnShipmentPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
>>>>>>> origin/main
}
