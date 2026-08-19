import ServiceProjectPage, { api } from './ServiceProjectPage';

const windowMeta = { category: 'finance', name: 'Service Project', id: '800001' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ServiceProjectPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
