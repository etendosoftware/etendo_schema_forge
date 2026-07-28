import AccountingPage, { api } from './AccountingPage';

const windowMeta = { category: 'finance', name: 'End Year Close', id: 'B5673F73F613496C8BEA22FB55E4E1E4' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <AccountingPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
