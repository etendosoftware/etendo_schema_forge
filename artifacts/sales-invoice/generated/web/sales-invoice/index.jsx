import InvoicePage from './InvoicePage';

const windowMeta = { category: 'sales', name: 'Sales Invoice' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <InvoicePage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
