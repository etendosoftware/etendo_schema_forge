import ReturnToVendorShipmentPage, { api } from './ReturnToVendorShipmentPage';

const windowMeta = { category: 'purchases', name: 'Return to Vendor Shipment', id: '273673D2ED914C399A6C51DB758BE0F9' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ReturnToVendorShipmentPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
