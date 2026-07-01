import ReturnToVendorShipmentPage, { api } from './ReturnToVendorShipmentPage';

const windowMeta = { category: 'purchases', name: 'Return to Vendor Shipment' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ReturnToVendorShipmentPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
