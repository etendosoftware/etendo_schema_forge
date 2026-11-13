import RemittancePage, { api } from './RemittancePage';

const windowMeta = { category: 'finance', name: 'Remittance', id: 'FF8080812E71F7C7012E71FD0499001B' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <RemittancePage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
