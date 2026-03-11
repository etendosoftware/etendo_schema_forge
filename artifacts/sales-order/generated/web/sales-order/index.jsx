import OrderPage from './OrderPage';

const windowMeta = { category: 'sales', name: 'Sales Order' };

export default function App({ token, apiBaseUrl, window }) {
  return <OrderPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
