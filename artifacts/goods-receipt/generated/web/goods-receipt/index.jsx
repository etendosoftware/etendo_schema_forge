import GoodsReceiptPage from './GoodsReceiptPage';

const windowMeta = { category: 'procurement', name: 'Goods Receipt' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <GoodsReceiptPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
