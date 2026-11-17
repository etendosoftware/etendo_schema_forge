import HeaderPage, { api } from './HeaderPage';

const windowMeta = { category: 'purchases', name: 'Invoice Inbox', id: '81AC659E93504927B459E0CAE80CE923' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <HeaderPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
