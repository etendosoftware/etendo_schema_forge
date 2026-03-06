import OrderPage from './OrderPage';

export default function App({ token, apiBaseUrl, window }) {
  return <OrderPage token={token} apiBaseUrl={apiBaseUrl} window={window} />;
}
