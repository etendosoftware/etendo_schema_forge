import QuotationPage, { api } from './QuotationPage';

const windowMeta = { category: 'sales', name: 'Sales Quotation', id: '6CB5B67ED33F47DFA334079D3EA2340E' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <QuotationPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
