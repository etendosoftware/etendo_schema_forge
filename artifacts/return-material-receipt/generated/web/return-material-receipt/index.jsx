import ReturnReceiptPage from './ReturnReceiptPage';

const windowMeta = { category: 'sales', name: 'Return Material Receipt' };

export default function App({ token, apiBaseUrl, window }) {
  return <ReturnReceiptPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
