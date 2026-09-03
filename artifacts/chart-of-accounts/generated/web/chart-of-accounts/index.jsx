import ElementValuePage, { api } from './ElementValuePage';

const windowMeta = { category: 'finance', name: 'Chart of Accounts', id: '118' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ElementValuePage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
