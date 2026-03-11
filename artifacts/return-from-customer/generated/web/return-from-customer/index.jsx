import CustomerReturnPage from './CustomerReturnPage';

const windowMeta = { category: 'sales', name: 'Return from Customer' };

export default function App({ token, apiBaseUrl, window }) {
  return <CustomerReturnPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
