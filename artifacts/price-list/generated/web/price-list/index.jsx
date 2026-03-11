import PriceListPage from './PriceListPage';

const windowMeta = { category: 'reference', name: 'Price List' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <PriceListPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
