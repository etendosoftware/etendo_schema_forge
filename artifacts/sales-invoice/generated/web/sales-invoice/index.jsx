import InvoicePage from './InvoicePage';

const windowMeta = { category: 'sales', name: 'Sales Invoice' };

export default function App({ token, apiBaseUrl, window }) {
  return <InvoicePage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
