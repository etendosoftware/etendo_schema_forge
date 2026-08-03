import AccountPage, { api } from './AccountPage';

const windowMeta = { category: 'finance', name: 'Accounts', id: '94EAA455D2644E04AB25D93BE5157B6D' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <AccountPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
