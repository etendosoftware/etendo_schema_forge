import GoodsShipmentPage, { api } from './GoodsShipmentPage';

const windowMeta = { category: 'sales', name: 'Goods Shipment', id: '169' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <GoodsShipmentPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
