import AccountPage from './AccountPage';

const windowMeta = { category: 'accounting', name: 'Chart of Accounts' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <AccountPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} {...rest} />;
}
// @sf-generated-end component:App
