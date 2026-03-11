import CustomerReturnPage from './CustomerReturnPage';

const windowMeta = { category: 'sales', name: 'Return from Customer' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <CustomerReturnPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
