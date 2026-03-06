import InvoicePage from './InvoicePage';

export default function App({ token, apiBaseUrl, window }) {
  return <InvoicePage token={token} apiBaseUrl={apiBaseUrl} window={window} />;
}
