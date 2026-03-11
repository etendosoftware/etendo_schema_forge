import GoodsReceiptPage from './GoodsReceiptPage';

const windowMeta = { category: 'procurement', name: 'Goods Receipt' };

<<<<<<< HEAD
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <GoodsReceiptPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} {...rest} />;
=======
export default function App({ token, apiBaseUrl, window }) {
  return <GoodsReceiptPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
>>>>>>> origin/main
}
