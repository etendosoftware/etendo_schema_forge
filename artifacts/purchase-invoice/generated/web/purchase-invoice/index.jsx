import InvoicePage from './InvoicePage';

const windowMeta = { category: 'procurement', name: 'Purchase Invoice' };

export default function App({ token, apiBaseUrl, window }) {
  return <InvoicePage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
