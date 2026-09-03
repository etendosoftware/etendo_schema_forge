import MatchedInvoicePage, { api } from './MatchedInvoicePage';

const windowMeta = { category: 'purchases', name: 'Matched Purchase Invoices', readOnly: true, id: '107' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <MatchedInvoicePage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
