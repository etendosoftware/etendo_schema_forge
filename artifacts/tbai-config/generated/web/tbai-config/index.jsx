import HeaderPage, { api } from './HeaderPage';

const windowMeta = { category: 'configuration', name: 'TBAI Config', id: 'C327DE215AC945F69363905840118177' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <HeaderPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
