import OrderPage from './OrderPage';

const windowMeta = { category: 'procurement', name: 'Purchase Order' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <OrderPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
