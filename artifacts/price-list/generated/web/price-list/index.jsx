import PriceListPage from './PriceListPage';

const windowMeta = { category: 'reference', name: 'Price List' };

export default function App({ token, apiBaseUrl, window }) {
  return <PriceListPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
