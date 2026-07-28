import GoodsReceiptPage, { api } from './GoodsReceiptPage';

const windowMeta = { category: 'purchases', name: 'Goods Receipt', id: '184' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <GoodsReceiptPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
